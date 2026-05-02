/**
 * Cloud API 프록시 헬퍼
 * 모든 API 호출을 /api/cloud-proxy를 통해 클라우드 서버로 전달
 * Vercel Serverless Functions 제한을 우회하기 위한 통합 프록시
 */

const PROXY_BASE = '/api/cloud-proxy';

/**
 * GET 요청을 cloud-proxy를 통해 전달
 * @param endpoint - 서버 API 엔드포인트 (예: 'naver-local-search')
 * @param params - 쿼리 파라미터 객체
 */
export async function cloudGet(endpoint: string, params: Record<string, string> = {}): Promise<any> {
  const queryParams = new URLSearchParams({ endpoint, ...params });
  const url = `${PROXY_BASE}?${queryParams.toString()}`;
  
  const res = await fetch(url);
  const data = await res.json();
  
  if (!res.ok) {
    throw new Error(data.error || data.message || `API 오류: ${res.status}`);
  }
  
  return data;
}

/**
 * POST 요청을 cloud-proxy를 통해 전달
 * @param endpoint - 서버 API 엔드포인트 (예: 'manus-task-create')
 * @param body - POST 요청 본문
 */
export async function cloudPost(endpoint: string, body: Record<string, any> = {}): Promise<any> {
  const res = await fetch(PROXY_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint, params: body }),
  });
  
  const data = await res.json();
  
  if (!res.ok) {
    throw new Error(data.error || data.message || `API 오류: ${res.status}`);
  }
  
  return data;
}

/**
 * Task 요청을 cloud-proxy를 통해 전달 (기존 task 형식 유지)
 * @param taskType - 작업 유형 (예: 'smartstore-orders')
 * @param params - 작업 파라미터
 */
export async function cloudTask(taskType: string, params: Record<string, any> = {}): Promise<any> {
  const res = await fetch(PROXY_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskType, params }),
  });
  
  const data = await res.json();
  
  if (!res.ok) {
    throw new Error(data.error || data.message || `API 오류: ${res.status}`);
  }
  
  return data;
}
