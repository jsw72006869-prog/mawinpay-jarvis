/**
 * /mission-map 독립 페이지
 * 별도 브라우저 탭에서 열어 대화창과 동시에 사용 가능
 * BroadcastChannel을 통해 JarvisApp 탭과 실시간 통신
 */
import NeuralMissionMap from './NeuralMissionMap';

export default function MissionMapPage() {
  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: '#030608' }}>
      <NeuralMissionMap onClose={() => {
        // 독립 페이지에서는 닫기 시 메인 페이지로 이동
        window.location.href = '/';
      }} />
    </div>
  );
}
