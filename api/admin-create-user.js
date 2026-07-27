import { createClient } from "@supabase/supabase-js";

const hiddenEmail = (username) =>
  `${username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "")}@emberjourney.app`;

const authPassword = (password) => `${password}#E8`;

export default async function handler(request, response) {
  response.setHeader("Content-Type", "application/json");

  try {
    if (request.method !== "POST") {
      return response.status(405).json({
        error: "Method not allowed."
      });
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

    const supabaseAdmin = createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    const { data: authData, error: authError } =
      await supabaseAdmin.auth.getUser(accessToken);

    if (authError || !authData?.user) {
      return response.status(401).json({
        error: "Your Admin session is invalid or expired."
      });
    }

    const { data: adminProfile, error: profileError } =
      await supabaseAdmin
        .from("profiles")
        .select("role")
        .eq("id", authData.user.id)
        .single();

    if (profileError) {
      return response.status(500).json({
        error: `Unable to verify Admin role: ${profileError.message}`
      });
    }

    if (adminProfile?.role !== "admin") {
      return response.status(403).json({
        error: "Only Admins can create Participant accounts."
      });
    }

    const { username, password, full_name } = request.body || {};

    if (!username || !password || !full_name) {
      return response.status(400).json({
        error: "Full name, username, and password are required."
      });
    }

    const cleanUsername = username
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, "");

    if (!cleanUsername) {
      return response.status(400).json({
        error: "Enter a valid username."
      });
    }

    const { data: createdUser, error: createError } =
      await supabaseAdmin.auth.admin.createUser({
        email: hiddenEmail(cleanUsername),
        password: authPassword(password),
        email_confirm: true,
        user_metadata: {
          username: cleanUsername,
          full_name: full_name.trim(),
          role: "participant"
        }
      });

    if (createError) {
      return response.status(400).json({
        error: createError.message
      });
    }

    return response.status(201).json({
      success: true,
      id: createdUser.user.id,
      username: cleanUsername
    });
  } catch (error) {
    console.error("admin-create-user error:", error);

    return response.status(500).json({
      error: error instanceof Error
        ? error.message
        : "An unexpected server error occurred."
    });
  }
}
