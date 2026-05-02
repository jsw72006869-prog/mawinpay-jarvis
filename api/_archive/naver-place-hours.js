// api/naver-place-hours.js
// 네이버 플레이스 영업시간 파싱 API
// 네이버 검색 API로 업체 목록 수집 → 각 업체 플레이스 페이지에서 영업시간 파싱 → 필터링

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { query, hours_filter, display = 30 } = req.query;
  // hours_filter: '24h' | 'late_night' | 'all'
  // late_night = 22시 이후까지 영업

  if (!query) {
    return res.status(400).json({ success: false, error: 'query 파라미터가 필요합니다.' });
  }

  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res.status(500).json({ success: false, error: 'NAVER API 키가 설정되지 않았습니다.' });
  }

  try {
    // 1단계: 네이버 검색 API로 업체 목록 수집
    const searchRes = await fetch(
      `https://openapi.naver.com/v1/search/local.json?query=${encodeURIComponent(query)}&display=${Math.min(Number(display), 100)}&start=1&sort=comment`,
      {
        headers: {
          'X-Naver-Client-Id': clientId,
          'X-Naver-Client-Secret': clientSecret,
        },
      }
    );

    if (!searchRes.ok) {
      const errText = await searchRes.text();
      return res.status(searchRes.status).json({ success: false, error: `네이버 API 오류: ${errText}` });
    }

    const searchData = await searchRes.json();
    const rawItems = searchData.items || [];

    // HTML 태그 제거 유틸
    const stripHtml = (str) => str.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();

    // 2단계: 각 업체 플레이스 페이지에서 영업시간 파싱
    const itemsWithHours = await Promise.all(
      rawItems.map(async (item) => {
        const name = stripHtml(item.title);
        const address = item.roadAddress || item.address || '';
        const phone = item.telephone || '';
        const category = item.category || '';
        const link = item.link || '';

        // 네이버 플레이스 ID 추출 (link URL에서)
        let placeId = '';
        let businessHours = null;
        let is24h = false;
        let isLateNight = false;
        let hoursText = '';

        try {
          // link가 네이버 플레이스 URL인 경우 ID 추출
          const placeMatch = link.match(/place\/(\d+)/);
          if (placeMatch) {
            placeId = placeMatch[1];
          } else {
            // 업체명 + 주소로 플레이스 검색
            const searchQuery = encodeURIComponent(`${name} ${address.split(' ').slice(0, 3).join(' ')}`);
            const placeSearchUrl = `https://map.naver.com/v5/api/search?caller=pcweb&query=${searchQuery}&type=all&page=1&displayCount=1&isPlaceRecommendation=true&lang=ko`;
            
            const placeSearchRes = await fetch(placeSearchUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://map.naver.com/',
                'Accept': 'application/json',
              },
            });

            if (placeSearchRes.ok) {
              const placeSearchData = await placeSearchRes.json();
              const firstResult = placeSearchData?.result?.place?.list?.[0];
              if (firstResult?.id) {
                placeId = firstResult.id;
              }
            }
          }

          // 플레이스 ID로 영업시간 API 호출
          if (placeId) {
            const placeApiUrl = `https://map.naver.com/v5/api/sites/summary/${placeId}?lang=ko`;
            const placeRes = await fetch(placeApiUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': `https://map.naver.com/v5/entry/place/${placeId}`,
                'Accept': 'application/json',
              },
            });

            if (placeRes.ok) {
              const placeData = await placeRes.json();
              const bizHours = placeData?.businessHours || placeData?.bizhours;

              if (bizHours) {
                businessHours = bizHours;
                // 24시간 여부 확인
                const hoursStr = JSON.stringify(bizHours).toLowerCase();
                if (hoursStr.includes('24시간') || hoursStr.includes('00:00~24:00') || hoursStr.includes('0000~2400') || hoursStr.includes('24hours')) {
                  is24h = true;
                  hoursText = '24시간 영업';
                } else {
                  // 영업시간 텍스트 추출
                  const todayHours = bizHours?.today || bizHours?.mon || Object.values(bizHours || {})[0];
                  if (todayHours) {
                    hoursText = typeof todayHours === 'string' ? todayHours : JSON.stringify(todayHours);
                    // 심야 영업 확인 (22시 이후)
                    const closeMatch = hoursText.match(/~\s*(\d{2}):?(\d{2})/);
                    if (closeMatch) {
                      const closeHour = parseInt(closeMatch[1]);
                      if (closeHour >= 22 || closeHour <= 4) {
                        isLateNight = true;
                      }
                    }
                  }
                }
              }
            }
          }
        } catch (parseErr) {
          // 개별 업체 파싱 실패 시 무시하고 계속
          console.warn(`[PlaceHours] ${name} 파싱 실패:`, parseErr.message);
        }

        // 300ms 딜레이 (네이버 차단 방지)
        await new Promise(r => setTimeout(r, 300));

        return {
          name,
          category,
          address,
          phone,
          link,
          placeId,
          hoursText,
          is24h,
          isLateNight,
          businessHours,
        };
      })
    );

    // 3단계: 영업시간 필터 적용
    let filtered = itemsWithHours;
    if (hours_filter === '24h') {
      filtered = itemsWithHours.filter(i => i.is24h);
    } else if (hours_filter === 'late_night') {
      filtered = itemsWithHours.filter(i => i.is24h || i.isLateNight);
    }

    // 영업시간 정보 수집된 업체 수
    const hoursFoundCount = itemsWithHours.filter(i => i.hoursText).length;
    const h24Count = itemsWithHours.filter(i => i.is24h).length;
    const lateCount = itemsWithHours.filter(i => i.isLateNight && !i.is24h).length;

    return res.status(200).json({
      success: true,
      total: searchData.total,
      collected: rawItems.length,
      filtered: filtered.length,
      hoursFoundCount,
      h24Count,
      lateCount,
      items: filtered,
      // 필터 결과가 없을 때 대안 제안
      suggestion: filtered.length === 0 && hours_filter === '24h'
        ? `24시간 업체를 찾지 못했습니다. 심야 영업(22시 이후) 업체 ${lateCount}개가 있습니다.`
        : null,
    });

  } catch (err) {
    console.error('[naver-place-hours] 오류:', err);
    return res.status(500).json({ success: false, error: String(err.message || err) });
  }
}
