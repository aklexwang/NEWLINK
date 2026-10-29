import { TonConnectProvider } from '../providers/TonConnectProvider';
import { SubmitPage } from './SubmitPage';

/** 제보 화면만 TON 지갑 연결을 쓴다. 따로 불러와 회원 화면 첫 로딩을 가볍게 한다 */
export default function SubmitRoute() {
  return (
    <TonConnectProvider>
      <SubmitPage />
    </TonConnectProvider>
  );
}
