import { createClient } from "@supabase/supabase-js";

const PROTECTED_ADMIN_USERNAMES = new Set(["jesember", "cassyember"]);

export default async function handler(request, response) {
  response.setHeader("Content-Type", "application/json");

  try {
    if (request.method !== "POST") {
      return response.status(405).json({ error: "Method not allowed." });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return response.status(500).json({
        error: "The server is missing its Supabase environment variables."
      });
    }

    const authorization = request.headers.authorization || "";
    const accessToken = authorization.startsWith("Bearer ")
      ? authorization.slice(7)
      : "";

    if (!accessToken) {
      return response.status(401).json({
        error: "Your Admin session is missing. Sign out and log in again."
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { data: authData, error: authError } =
      await supabaseAdmin.auth.getUser(accessToken);

    if (authError || !authData?.user) {
      return response.status(401).json({
        error: "Your Admin session is invalid or expired."
      });
    }

    const { data: adminProfile, error: adminProfileError } =
      await supabaseAdmin
        .from("profiles")
        .select("role, username")
        .eq("id", authData.user.id)
        .single();

    if (adminProfileError || adminProfile?.role !== "admin") {
      return response.status(403).json({
        error: "Only Admins can manage Participant accounts."
      });
    }

    const { action, participant_id } = request.body || {};

    if (!["reset_journey", "delete_participant"].includes(action)) {
      return response.status(400).json({ error: "Invalid Admin action." });
    }

    if (!participant_id) {
      return response.status(400).json({ error: "Participant ID is required." });
    }

    const { data: targetProfile, error: targetError } =
      await supabaseAdmin
        .from("profiles")
        .select("id, username, full_name, role")
        .eq("id", participant_id)
        .single();

    if (targetError || !targetProfile) {
      return response.status(404).json({ error: "Participant account not found." });
    }

    if (targetProfile.role === "admin" || PROTECTED_ADMIN_USERNAMES.has(targetProfile.username)) {
      return response.status(403).json({
        error: "Admin accounts are protected and cannot be deleted or reset here."
      });
    }

    if (action === "reset_journey") {
      const { error: resetError } = await supabaseAdmin
        .from("journey_entries")
        .delete()
        .eq("user_id", participant_id);

      if (resetError) {
        return response.status(500).json({
          error: `Unable to reset journey: ${resetError.message}`
        });
      }

      return response.status(200).json({ success: true });
    }

    const { error: deleteError } =
      await supabaseAdmin.auth.admin.deleteUser(participant_id);

    if (deleteError) {
      return response.status(500).json({
        error: `Unable to delete Participant: ${deleteError.message}`
      });
    }

    return response.status(200).json({ success: true });
  } catch (error) {
    console.error("admin-manage-user error:", error);
    return response.status(500).json({
      error: error instanceof Error ? error.message : "An unexpected server error occurred."
    });
  }
}
