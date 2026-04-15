/**
 * JARVIS 얼굴 실루엣 포인트 클라우드 생성
 * 수학적으로 얼굴 형태(타원 윤곽, 눈, 코, 입, 헬멧 라인)를 정의
 */

const COUNT = 12000;
const points = [];

// 헬퍼: 타원 위의 점 추가
function addEllipse(cx, cy, cz, rx, ry, n, jitter = 0.15) {
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    points.push([
      cx + Math.cos(t) * rx + (Math.random() - 0.5) * jitter,
      cy + Math.sin(t) * ry + (Math.random() - 0.5) * jitter,
      cz + (Math.random() - 0.5) * 0.3,
    ]);
  }
}

// 헬퍼: 호(arc) 추가
function addArc(cx, cy, cz, rx, ry, t0, t1, n, jitter = 0.12) {
  for (let i = 0; i < n; i++) {
    const t = t0 + (i / n) * (t1 - t0);
    points.push([
      cx + Math.cos(t) * rx + (Math.random() - 0.5) * jitter,
      cy + Math.sin(t) * ry + (Math.random() - 0.5) * jitter,
      cz + (Math.random() - 0.5) * 0.25,
    ]);
  }
}

// 헬퍼: 선분 추가
function addLine(x0, y0, x1, y1, z, n, jitter = 0.1) {
  for (let i = 0; i < n; i++) {
    const t = i / n;
    points.push([
      x0 + (x1 - x0) * t + (Math.random() - 0.5) * jitter,
      y0 + (y1 - y0) * t + (Math.random() - 0.5) * jitter,
      z + (Math.random() - 0.5) * 0.2,
    ]);
  }
}

// 헬퍼: 면(fill) 추가
function addFill(cx, cy, cz, rx, ry, n, jitter = 0.05) {
  for (let i = 0; i < n; i++) {
    const r = Math.sqrt(Math.random());
    const t = Math.random() * Math.PI * 2;
    points.push([
      cx + Math.cos(t) * rx * r + (Math.random() - 0.5) * jitter,
      cy + Math.sin(t) * ry * r + (Math.random() - 0.5) * jitter,
      cz + (Math.random() - 0.5) * 0.15,
    ]);
  }
}

// ── 얼굴 외곽 (타원형 헬멧) ──
addEllipse(0, 0, 0, 5.5, 7.0, 600, 0.2);
// 헬멧 내부 두께
addEllipse(0, 0, 0, 5.2, 6.7, 300, 0.15);

// ── 헬멧 상단 장식 라인 ──
addArc(0, 0, 0, 5.5, 7.0, Math.PI * 0.3, Math.PI * 0.7, 200, 0.1);
addLine(-2.5, 5.5, 2.5, 5.5, 0, 150, 0.1);

// ── 눈 (좌측) ──
addEllipse(-1.8, 1.2, 0.5, 1.0, 0.45, 300, 0.08);
addFill(-1.8, 1.2, 0.3, 0.85, 0.35, 200, 0.05);
// 눈 하이라이트
addFill(-1.4, 1.45, 0.8, 0.2, 0.12, 60, 0.03);

// ── 눈 (우측) ──
addEllipse(1.8, 1.2, 0.5, 1.0, 0.45, 300, 0.08);
addFill(1.8, 1.2, 0.3, 0.85, 0.35, 200, 0.05);
addFill(2.2, 1.45, 0.8, 0.2, 0.12, 60, 0.03);

// ── 눈썹 ──
addArc(-1.8, 2.0, 0.4, 1.1, 0.3, Math.PI * 0.15, Math.PI * 0.85, 150, 0.08);
addArc(1.8, 2.0, 0.4, 1.1, 0.3, Math.PI * 0.15, Math.PI * 0.85, 150, 0.08);

// ── 코 ──
addLine(0, 0.8, 0, -0.8, 0, 100, 0.08);
addLine(-0.4, -0.8, 0, -0.8, 0, 60, 0.06);
addLine(0.4, -0.8, 0, -0.8, 0, 60, 0.06);
addLine(-0.4, -0.8, -0.55, -1.1, 0, 40, 0.06);
addLine(0.4, -0.8, 0.55, -1.1, 0, 40, 0.06);

// ── 입 ──
addArc(0, -2.2, 0, 1.4, 0.5, Math.PI * 1.1, Math.PI * 1.9, 250, 0.1);
// 입술 두께
addArc(0, -2.2, 0, 1.3, 0.4, Math.PI * 1.1, Math.PI * 1.9, 120, 0.08);
// 윗입술
addArc(0, -2.0, 0, 1.2, 0.25, Math.PI * 0.1, Math.PI * 0.9, 150, 0.08);

// ── 광대뼈 / 턱선 ──
addArc(0, -1.5, 0, 5.5, 7.0, Math.PI * 1.1, Math.PI * 1.9, 300, 0.15);

// ── 헬멧 측면 장식 ──
addLine(-5.0, 2.0, -5.0, -2.0, 0, 100, 0.1);
addLine(5.0, 2.0, 5.0, -2.0, 0, 100, 0.1);
// 측면 패널 디테일
addLine(-5.5, 0.5, -4.5, 0.5, 0, 60, 0.08);
addLine(5.5, 0.5, 4.5, 0.5, 0, 60, 0.08);
addLine(-5.5, -0.5, -4.5, -0.5, 0, 60, 0.08);
addLine(5.5, -0.5, 4.5, -0.5, 0, 60, 0.08);

// ── 이마 중앙 장식 (아이언맨 스타일 삼각형) ──
addLine(-0.6, 4.5, 0, 5.5, 0, 80, 0.08);
addLine(0.6, 4.5, 0, 5.5, 0, 80, 0.08);
addLine(-0.6, 4.5, 0.6, 4.5, 0, 60, 0.06);
addFill(0, 4.8, 0.2, 0.4, 0.4, 80, 0.05);

// ── 목 / 넥 가드 ──
addLine(-1.5, -6.5, 1.5, -6.5, 0, 120, 0.1);
addLine(-1.5, -6.5, -2.0, -7.5, 0, 60, 0.08);
addLine(1.5, -6.5, 2.0, -7.5, 0, 60, 0.08);
addLine(-2.0, -7.5, 2.0, -7.5, 0, 120, 0.1);

// ── 나머지는 자유 부유 파티클로 채우기 ──
const remaining = COUNT - points.length;
for (let i = 0; i < remaining; i++) {
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(2 * Math.random() - 1);
  const r = 3 + Math.pow(Math.random(), 0.5) * 22;
  points.push([
    r * Math.sin(phi) * Math.cos(theta),
    r * Math.sin(phi) * Math.sin(theta) * 0.55,
    r * Math.cos(phi),
  ]);
}

// JSON 출력 (처음 12000개만)
const output = points.slice(0, COUNT);
console.log(JSON.stringify(output));
