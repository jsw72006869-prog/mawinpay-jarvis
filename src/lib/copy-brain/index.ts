/**
 * COPY-BRAIN-A.1: Mawin Agricultural Copy Brain Core
 * 모든 엔진 통합 export
 */
export * from './copyBrainTypes';
export { getProductTruth, productTruthToPrompt } from './productTruthEngine';
export { detectBuyerDesires, buyerDesiresToPrompt, DESIRE_DB } from './buyerDesireEngine';
export { extractCopyDnaFromSwipe, extractCopyDnaBatch, buildCopyDnaSummary, copyDNAToPrompt } from './copyDnaExtractor';
export { MAWI_VOICE_RULES, mawiVoiceToPrompt, detectBannedPhrases, scoreMawiVoice } from './mawiVoiceEngine';
export { getPlatformFormula, platformFormulaToPrompt, scorePlatformFit, inferPlatformFromOutputType } from './platformFormulaEngine';
export { detectBoringCopy, antiBoringWarning } from './antiBoringFilter';
export { judgeCopy } from './copyJudge';
export { checkCopyRisk, riskGuardPromptWarning } from './copyRiskGuard';
export { compileCopyBrainPrompt, previewPrompt } from './copyBrainCompiler';
