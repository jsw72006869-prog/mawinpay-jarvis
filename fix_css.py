import re

css = open('src/index.css').read()

# 1. scc-workspace 높이 확대: min(760px → min(860px, calc(100vh - 64px)
css = css.replace(
    'width: min(1280px, calc(100vw - 48px));\n  height: min(760px, calc(100vh - 96px));\n  max-height: calc(100vh - 96px);',
    'width: min(1360px, calc(100vw - 32px));\n  height: min(900px, calc(100vh - 64px));\n  max-height: calc(100vh - 64px);'
)

# 2. scc-grid-main 컬럼 minmax 제거 → 단순 fr 비율로
css = css.replace(
    'grid-template-columns: minmax(220px, 0.9fr) minmax(360px, 1.6fr) minmax(240px, 1fr);',
    'grid-template-columns: 0.8fr 1.8fr 1.1fr;'
)

# 3. mission-layout 비율도 통일
css = css.replace(
    'grid-template-columns: 0.8fr 1.8fr 1fr;',
    'grid-template-columns: 0.8fr 1.8fr 1.1fr;'
)

# 4. 912px 반응형에서도 높이 조정
css = css.replace(
    '    width: calc(100vw - 24px);\n    height: calc(100vh - 72px);\n    max-height: calc(100vh - 72px);',
    '    width: calc(100vw - 16px);\n    height: calc(100vh - 48px);\n    max-height: calc(100vh - 48px);'
)

# 5. scc-stage padding 줄여서 더 크게 표시
css = css.replace(
    '  padding: clamp(16px, 3vw, 48px);',
    '  padding: clamp(8px, 1.5vw, 24px);'
)

open('src/index.css', 'w').write(css)
print("CSS 수정 완료")

# 검증
css2 = open('src/index.css').read()
if '0.8fr 1.8fr 1.1fr' in css2:
    print("✓ mission-layout 비율 수정 확인")
if 'min(1360px' in css2:
    print("✓ scc-workspace 너비 확대 확인")
if 'min(900px' in css2:
    print("✓ scc-workspace 높이 확대 확인")
