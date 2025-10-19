import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { transactionId, code } = await req.json();

    if (!transactionId) {
      throw new Error("Transaction ID is required");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get transaction
    const { data: transaction, error: txError } = await supabase
      .from("transactions")
      .select("*, plans(*), profiles(*)")
      .eq("id", transactionId)
      .single();

    if (txError || !transaction) {
      throw new Error("Transaction not found");
    }

    if (transaction.status === "verified") {
      return new Response(
        JSON.stringify({ success: true, message: "Already verified" }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    // For now, we'll do simple code verification
    // In production, you'd integrate with M-Pesa, PayPal APIs
    let isValid = false;

    if (transaction.plans.verification_type === "auto") {
      // Auto-verify (for free plan or when APIs are integrated)
      isValid = true;
    } else if (code) {
      // Manual verification with code
      isValid = transaction.transaction_code === code;
    }

    if (!isValid) {
      throw new Error("Invalid verification code");
    }

    // Update transaction status
    await supabase
      .from("transactions")
      .update({
        status: "verified",
        verified_at: new Date().toISOString(),
      })
      .eq("id", transactionId);

    // Update user profile with new plan
    const expiresAt = transaction.plans.duration_days
      ? new Date(Date.now() + transaction.plans.duration_days * 24 * 60 * 60 * 1000)
      : null;

    const searchLimit = transaction.plans.search_limit === -1 
      ? 999999 
      : transaction.plans.search_limit;

    await supabase
      .from("profiles")
      .update({
        plan_type: transaction.plans.name.toLowerCase(),
        daily_searches_limit: searchLimit,
        daily_searches_used: 0,
        plan_expires_at: expiresAt?.toISOString(),
      })
      .eq("id", transaction.user_id);

    return new Response(
      JSON.stringify({ 
        success: true,
        plan: transaction.plans.name,
        expiresAt: expiresAt?.toISOString(),
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in verify-payment:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
});
