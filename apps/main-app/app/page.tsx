import { ChatApp } from '@/components/ChatApp';
import { LoginGate } from '@/components/LoginGate';

export default function Page() {
  return (
    <LoginGate>
      <ChatApp />
    </LoginGate>
  );
}
