import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.1";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email } = await req.json();

    if (!email) {
      throw new Error("Email is required");
    }

    // Generate 6-digit code
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();

    // Store code in database with expiry (10 minutes)
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Store reset code temporarily (you might want to create a password_resets table)
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await supabase.from("password_resets").upsert({
      email,
      code: resetCode,
      expires_at: expiresAt.toISOString(),
      used: false,
    });

    // Send email with reset code
    const emailResponse = await resend.emails.send({
      from: "Logirc AI <logircltd@gmail.com>",
      to: [email],
      subject: "Password Reset Code - Logirc AI",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #1E40AF;">Password Reset Code</h1>
          <p>You requested to reset your password for Logirc AI.</p>
          <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
            <h2 style="color: #1E40AF; font-size: 32px; letter-spacing: 4px; margin: 0;">${resetCode}</h2>
          </div>
          <p>This code will expire in 10 minutes.</p>
          <p>If you didn't request this reset, please ignore this email.</p>
          <p style="margin-top: 30px; color: #6B7280; font-size: 12px;">
            Best regards,<br>
            The Logirc AI Team
          </p>
        </div>
      `,
    });

    console.log("Reset code sent:", emailResponse);

    return new Response(
      JSON.stringify({ success: true }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in send-reset-code:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
});
