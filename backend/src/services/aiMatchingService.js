import { supabase } from '../config/supabaseClient.js';
import { AppError, ValidationError } from '../utils/errors.js';
import { eligibilityService } from './eligibilityService.js';

// Common stop-words filtered out to focus on domain-specific engineering terminology
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
  'by', 'from', 'is', 'are', 'was', 'were', 'it', 'this', 'that', 'i', 'we',
  'want', 'need', 'project', 'build', 'using', 'based', 'system', 'device'
]);

/**
 * AI Resource Matching Service
 * Recommends equipment matching a student project description using weighted keyword relevance
 * and cross-references results with TrustPass eligibility.
 */
export const aiMatchingService = {
  /**
   * Tokenize and normalize project prompt text into relevant search keywords.
   */
  extractKeywords(text) {
    if (!text || typeof text !== 'string') return [];
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
  },

  /**
   * Match available resources to a project description.
   *
   * @param {Object} params
   * @param {string} params.projectDescription - Natural language project summary
   * @param {string} [params.userId] - Optional student UUID to check eligibility in results
   * @param {number} [params.limit=5] - Maximum recommendations to return
   * @returns {Promise<Array>} Ranked matching resources with relevance scores and eligibility
   */
  async matchResources({ projectDescription, userId = null, limit = 5 }) {
    if (!projectDescription || projectDescription.trim().length < 5) {
      throw new ValidationError('Please provide a project description of at least 5 characters.');
    }

    const keywords = this.extractKeywords(projectDescription);
    if (keywords.length === 0) {
      return [];
    }

    // 1. Fetch all active equipment listings
    const { data: resources, error } = await supabase
      .from('resources')
      .select('*, profiles:owner_id(full_name, institution), resource_requirements(*)')
      .eq('status', 'available');

    if (error) {
      throw new AppError(`Failed to search resource catalog: ${error.message}`, 400, error);
    }

    if (!resources || resources.length === 0) {
      return [];
    }

    // 2. Score each resource against extracted project keywords
    const scored = [];

    for (const item of resources) {
      const nameText = (item.name || '').toLowerCase();
      const descText = (item.description || '').toLowerCase();
      const catText = (item.category || '').toLowerCase();

      let score = 0;
      const matchedTerms = [];

      for (const kw of keywords) {
        let termMatched = false;

        // Highest weight: equipment name match (3 points)
        if (nameText.includes(kw)) {
          score += 3;
          termMatched = true;
        }

        // Category match (2 points)
        if (catText.includes(kw)) {
          score += 2;
          termMatched = true;
        }

        // Description match (1 point)
        if (descText.includes(kw)) {
          score += 1;
          termMatched = true;
        }

        if (termMatched) {
          matchedTerms.push(kw);
        }
      }

      if (score > 0) {
        scored.push({
          resource: item,
          relevanceScore: score,
          matchedKeywords: [...new Set(matchedTerms)],
        });
      }
    }

    // Sort descending by relevance score
    scored.sort((a, b) => b.relevanceScore - a.relevanceScore);
    const topMatches = scored.slice(0, limit);

    // 3. If a userId is supplied, evaluate TrustPass eligibility for each match
    const results = [];
    for (const entry of topMatches) {
      let eligibility = { eligible: true, reason: 'No student ID provided for check.' };

      if (userId) {
        try {
          eligibility = await eligibilityService.checkResourceEligibility(userId, entry.resource.id);
        } catch {
          eligibility = { eligible: false, reason: 'Unable to evaluate eligibility.' };
        }
      }

      results.push({
        resource: entry.resource,
        relevanceScore: entry.relevanceScore,
        matchedKeywords: entry.matchedKeywords,
        trustPass: eligibility,
      });
    }

    return results;
  },
};