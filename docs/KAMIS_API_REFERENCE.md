# KAMIS 농산물유통정보 Open API 레퍼런스

## 인증 방식
- `p_cert_key`: 인증 Key (KAMIS 사이트에서 발급)
- `p_cert_id`: 요청자 ID (회원가입 후 발급)
- 테스트용: `p_cert_key=test`, `p_cert_id=test` (제한된 데이터)

## 주요 API 엔드포인트

### 1. 최근일자 도소매 가격정보 (상품 기준)
- **URL**: `http://www.kamis.or.kr/service/price/xml.do?action=dailySalesList`
- **파라미터**:
  - `p_cert_key` (string): 인증Key
  - `p_cert_id` (string): 요청자ID
  - `p_returntype` (string): json 또는 xml

### 2. 월평균 가격추이 조회 (상품 기준)
- **URL**: `http://www.kamis.or.kr/service/price/xml.do?action=monthlyPriceTrendList`
- **추가 파라미터**:
  - `p_productclscode`: 구분 (01:소매, 02:도매)
  - `p_startday`: 시작일 (YYYY-MM-DD)
  - `p_endday`: 종료일 (YYYY-MM-DD)
  - `p_itemcategorycode`: 부류코드
  - `p_itemcode`: 품목코드
  - `p_kindcode`: 품종코드
  - `p_productrankcode`: 등급코드
  - `p_countrycode`: 지역코드

## 응답 필드
| 필드 | 설명 |
|------|------|
| product_cls_code | 구분 (01:소매, 02:도매) |
| category_code | 부류코드 |
| productno | 품목코드 |
| productName | 품목명 |
| item_name | 품종명 |
| unit | 단위 |
| day1 / dpr1 | 최근 조사일자 / 가격 |
| day2 / dpr2 | 1일전 일자 / 가격 |
| day3 / dpr3 | 1개월전 일자 / 가격 |
| day4 / dpr4 | 1년전 일자 / 가격 |
| direction | 등락여부 (0:하락, 1:상승, 2:등락없음) |
| value | 등락율 |

## 에러 코드
| code | Message |
|------|---------|
| 000 | Success |
| 200 | Wrong Parameters |
| 900 | Unauthenticated request |

## 주요 품목코드 (옥수수 관련)
- 옥수수: 225 (식량작물 > 잡곡류)
- 밤: 407 (과일류)

## 환경변수 설정
```
KAMIS_API_KEY=발급받은_인증키
KAMIS_CERT_ID=발급받은_요청자ID
```
