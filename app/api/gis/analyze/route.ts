/**
 * POST /api/gis/analyze
 *
 * Scores an AOI against all 7 regenerative practices (explore mode)
 * or a single selected practice (project mode).
 *
 * Request body: AnalyzeRequest (see lib/scoring/types.ts)
 * Response:     AnalyzeResponse (SCORING_V1 output contract)
 *
 * MVP providers:
 *   DataProvider → StubProvider  (deterministic hash of AOI geometry)
 *   KOIService   → StubKOIService (deterministic hash of AOI geometry + practice)
 */

import { NextRequest, NextResponse } from 'next/server';
import { scoreAOI } from '@/lib/scoring/index';
import { StubProvider, StubKOIService } from '@/lib/scoring/stubProvider';
import { PRACTICE_IDS } from '@/lib/scoring/types';
import type { AnalyzeRequest, PracticeId, StagePreference } from '@/lib/scoring/types';

// ============================================================
// INPUT VALIDATION
// ============================================================

const VALID_MODES   = ['explore', 'project'] as const;
const VALID_STAGES  = ['explore', 'pipeline', 'verified'] as const;

interface ValidationError {
  field: string;
  message: string;
}

function validateRequest(body: unknown): {
  data: AnalyzeRequest | null;
  errors: ValidationError[];
} {
  const errors: ValidationError[] = [];

  if (typeof body !== 'object' || body === null) {
    return { data: null, errors: [{ field: 'body', message: 'Request body must be a JSON object' }] };
  }

  const raw = body as Record<string, unknown>;

  // mode
  if (!raw.mode || !VALID_MODES.includes(raw.mode as 'explore' | 'project')) {
    errors.push({ field: 'mode', message: `mode must be one of: ${VALID_MODES.join(', ')}` });
  }

  // aoi
  if (!raw.aoi || typeof raw.aoi !== 'object') {
    errors.push({ field: 'aoi', message: 'aoi must be an object' });
  } else {
    const aoi = raw.aoi as Record<string, unknown>;

    if (aoi.type !== 'polygon') {
      errors.push({ field: 'aoi.type', message: 'aoi.type must be "polygon"' });
    }

    if (!aoi.geometry || typeof aoi.geometry !== 'object') {
      errors.push({ field: 'aoi.geometry', message: 'aoi.geometry must be an object' });
    } else {
      const geom = aoi.geometry as Record<string, unknown>;
      if (geom.type !== 'Polygon') {
        errors.push({ field: 'aoi.geometry.type', message: 'aoi.geometry.type must be "Polygon"' });
      }
      if (!Array.isArray(geom.coordinates) || geom.coordinates.length === 0) {
        errors.push({ field: 'aoi.geometry.coordinates', message: 'aoi.geometry.coordinates must be a non-empty array' });
      }
    }

    if (typeof aoi.area_ha !== 'number' || aoi.area_ha <= 0) {
      errors.push({ field: 'aoi.area_ha', message: 'aoi.area_ha must be a positive number' });
    }

    if (aoi.region !== undefined && typeof aoi.region !== 'string') {
      errors.push({ field: 'aoi.region', message: 'aoi.region must be a string if provided' });
    }
  }

  // selected_practice (optional, required only in project mode)
  if (raw.selected_practice !== undefined) {
    if (!PRACTICE_IDS.includes(raw.selected_practice as PracticeId)) {
      errors.push({
        field: 'selected_practice',
        message: `selected_practice must be one of: ${PRACTICE_IDS.join(', ')}`,
      });
    }
  }
  if (raw.mode === 'project' && raw.selected_practice === undefined) {
    errors.push({
      field: 'selected_practice',
      message: 'selected_practice is required in project mode',
    });
  }

  // stage (optional)
  if (raw.stage !== undefined && !VALID_STAGES.includes(raw.stage as StagePreference)) {
    errors.push({ field: 'stage', message: `stage must be one of: ${VALID_STAGES.join(', ')}` });
  }

  if (errors.length > 0) return { data: null, errors };

  return {
    data: raw as unknown as AnalyzeRequest,
    errors: [],
  };
}

// ============================================================
// ROUTE HANDLER
// ============================================================

// Singleton providers — instantiated once per cold start
const dataProvider = new StubProvider();
const koiService   = new StubKOIService();

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Parse body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body', details: [] },
      { status: 400 }
    );
  }

  // Validate
  const { data, errors } = validateRequest(body);
  if (errors.length > 0 || !data) {
    return NextResponse.json(
      { error: 'Validation failed', details: errors },
      { status: 422 }
    );
  }

  // Score
  try {
    const response = await scoreAOI(data, dataProvider, koiService);
    return NextResponse.json(response, { status: 200 });
  } catch (err) {
    console.error('[/api/gis/analyze] Scoring error:', err);
    return NextResponse.json(
      {
        error: 'Scoring pipeline error',
        message: err instanceof Error ? err.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// Reject other methods
export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    { error: 'Method not allowed. Use POST.' },
    { status: 405 }
  );
}
