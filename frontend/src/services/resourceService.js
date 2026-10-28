
import { supabase } from "../lib/supabase";

export const resourceService = {
  async getResources({
    category,
    location,
    status = "available",
    search,
    page = 1,
    limit = 20,
  } = {}) {
    let query = supabase
      .from("resources")
      .select(
        "*, profiles:owner_id(id, full_name, institution), resource_requirements(*)",
        { count: "exact" }
      );

    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    if (category) {
      query = query.eq("category", category);
    }

    if (location?.trim()) {
      query = query.ilike("location", `%${location.trim()}%`);
    }

    if (search?.trim()) {
      const term = search.trim().replace(/[,%()]/g, " ");
      query = query.or(
        `name.ilike.%${term}%,description.ilike.%${term}%`
      );
    }

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) {
      throw new Error(`Failed to load equipment: ${error.message}`);
    }

    return {
      resources: data || [],
      pagination: {
        totalItems: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
        currentPage: page,
        limit,
      },
    };
  },
};
