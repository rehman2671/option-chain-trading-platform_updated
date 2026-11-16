/**
 * Offline artifact checksum gate.
 *
 * This compares the SHA256 of the original separately retained vendor/feed
 * artifact to the reference declared in the derived JSON bundle. It catches
 * accidental mismatches/tampering but CANNOT authenticate the vendor, the
 * exchange, feed event times, data licensing, or the claimed source record IDs.
 *
 * Never accept the generated bundle as its own evidence artifact.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import type { VerifiedHistoricalBundleV1 } from './adaptiveVendorIngestion.js';

export interface SourceArtifactAudit {
  mode: 'RESEARCH_ONLY';
  executionAuthorized: false;
  marketAuthenticityVerified: false;
  status: 'MISSING_SOURCE' | 'INVALID_PROVENANCE' |
    'CHECKSUM_MISMATCH' | 'CHECKSUM_MATCHED_AUTHENTICITY_UNVERIFIED';
  digestSha256: string | null;
  expectedSha256: string | null;
  errors: string[];
}
export function auditAdaptiveSourceArtifact(
  raw: unknown, artifactBytes?: Uint8Array | null
): SourceArtifactAudit {
  const base = {
    mode: 'RESEARCH_ONLY' as const,
    executionAuthorized: false as const,
    marketAuthenticityVerified: false as const
  };
  const p = (raw as Partial<VerifiedHistoricalBundleV1> | null)?.provenance;
  const digest = p?.sourceArtifactSha256;
  if (typeof digest !== 'string' || !/^[0-9a-f]{64}$/.test(digest) ||
      !['ORIGINAL_EVENT_FEED_ARCHIVE','LICENSED_HISTORICAL_L1'].includes(p?.collection as string)) {
    return { ...base, status:'INVALID_PROVENANCE',
      digestSha256:null,expectedSha256:null,errors:['INVALID_SOURCE_ARTIFACT_MANIFEST'] };
  }
  if (!(artifactBytes instanceof Uint8Array) || artifactBytes.length === 0) {
    return { ...base, status:'MISSING_SOURCE',
      digestSha256:null,expectedSha256:digest,errors:['ORIGINAL_VENDOR_ARTIFACT_REQUIRED'] };
  }
  const actual = createHash('sha256').update(artifactBytes).digest('hex');
  // Constant-time comparison avoids handling mismatch differently based on
  // the prefix, but is NOT an authenticity signature.
  const match = timingSafeEqual(Buffer.from(actual,'hex'),Buffer.from(digest,'hex'));
  return {
    ...base,
    status: match ? 'CHECKSUM_MATCHED_AUTHENTICITY_UNVERIFIED' : 'CHECKSUM_MISMATCH',
    digestSha256: actual, expectedSha256:digest,
    errors: match ? [] : ['ORIGINAL_SOURCE_ARTIFACT_SHA256_MISMATCH']
  };
}
