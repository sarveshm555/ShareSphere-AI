import { supabase } from "../lib/supabase";

export const bookingService = {
  async requestBooking({
    resourceId,
    startTime,
    endTime,
    purpose = null,
  }) {
    // 1. Validate booking dates
    const start = new Date(startTime);
    const end = new Date(endTime);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new Error("Please enter valid start and end dates.");
    }

    if (end <= start) {
      throw new Error("The end time must be after the start time.");
    }

    if (start < new Date()) {
      throw new Error("The start time must be in the future.");
    }

    // 2. Get the signed-in user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      throw new Error("Please sign in before requesting a booking.");
    }

    // 3. Fetch equipment requirements
    const { data: requirements, error: reqError } = await supabase
      .from("resource_requirements")
      .select("*")
      .eq("resource_id", resourceId);

    if (reqError) {
      console.error("Requirements query failed:", reqError);
      throw new Error("Could not load equipment requirements.");
    }

    // 4. Check the user's verified and non-expired records
    if (requirements && requirements.length > 0) {
      const { data: verifications, error: verificationError } =
        await supabase
          .from("eligibility_verifications")
          .select("*")
          .eq("user_id", user.id)
          .eq("status", "verified");

      if (verificationError) {
        console.error("Verification query failed:", verificationError);
        throw new Error("Could not check your eligibility.");
      }

      const now = new Date();

      const activeVerifications = (verifications || []).filter(
        (item) =>
          !item.expires_at || new Date(item.expires_at) > now
      );

      const missing = requirements.filter((req) => {
        return !activeVerifications.some(
          (v) =>
            v.requirement_type === req.requirement_type &&
            (
              (v.title || "").toLowerCase().includes(
                (req.description || "").toLowerCase()
              ) ||
              (req.description || "").toLowerCase().includes(
                (v.title || "").toLowerCase()
              ) ||
              v.requirement_type === "department_approval"
            )
        );
      });

      if (missing.length > 0) {
        throw new Error(
          `Required verification missing: ${missing
            .map((req) => req.description)
            .join(", ")}.`
        );
      }
    }

    // 5. Create a pending booking request
    const { data, error } = await supabase
      .from("bookings")
      .insert({
        resource_id: resourceId,
        borrower_id: user.id,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        purpose: purpose ? String(purpose).trim() : null,
        status: "pending",
      })
      .select()
      .single();

    if (error) {
      console.error("Booking insert failed:", error);
      throw new Error(
        error.message || "Unable to submit booking request."
      );
    }

    return data;
  },
};
