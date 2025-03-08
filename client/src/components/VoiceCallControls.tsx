import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { ChatService } from '@/lib/chat';

interface VoiceCallControlsProps {
  chatService: ChatService;
  selectedUser: string | null;
  onCallStateChange?: (isInCall: boolean) => void;
}

type CallState = 'idle' | 'calling' | 'receiving' | 'connected';

export default function VoiceCallControls({
  chatService,
  selectedUser,
  onCallStateChange
}: VoiceCallControlsProps) {
  const [callState, setCallState] = useState<CallState>('idle');
  const [currentCaller, setCurrentCaller] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const unsubscribe = chatService.onMessage((message) => {
      if (message.type === 'voice_call' && message.callData) {
        switch (message.callData.type) {
          case 'request':
            if (message.senderId) {
              setCurrentCaller(message.senderId);
              setCallState('receiving');
              onCallStateChange?.(true);
            }
            break;
          case 'accepted':
            setCallState('connected');
            break;
          case 'rejected':
            handleCallEnd('Call rejected');
            break;
          case 'ended':
            handleCallEnd('Call ended');
            break;
        }
      }
    });

    return () => {
      unsubscribe();
      if (callState !== 'idle') {
        chatService.endCall();
      }
    };
  }, [chatService]);

  const handleCallEnd = (message: string) => {
    setCallState('idle');
    setCurrentCaller(null);
    onCallStateChange?.(false);
    toast({
      title: "Call Ended",
      description: message
    });
  };

  const startCall = async () => {
    if (!selectedUser) {
      toast({
        title: "Cannot Start Call",
        description: "Please select a user to call",
        variant: "destructive"
      });
      return;
    }

    try {
      setCallState('calling');
      await chatService.initiateCall(selectedUser);
    } catch (error) {
      console.error('Error starting call:', error);
      handleCallEnd('Failed to start call');
    }
  };

  const acceptCall = async () => {
    if (!currentCaller) return;

    try {
      await chatService.acceptCall(currentCaller);
      setCallState('connected');
    } catch (error) {
      console.error('Error accepting call:', error);
      handleCallEnd('Failed to accept call');
    }
  };

  const rejectCall = () => {
    if (!currentCaller) return;
    
    chatService.rejectCall(currentCaller);
    handleCallEnd('Call rejected');
  };

  const endCall = () => {
    chatService.endCall();
    handleCallEnd('Call ended');
  };

  const toggleMute = () => {
    // Implementation for mute/unmute
    setIsMuted(!isMuted);
  };

  return (
    <div className="flex flex-col gap-2 p-4 bg-gray-50 rounded-lg">
      {callState === 'idle' && (
        <Button
          onClick={startCall}
          disabled={!selectedUser}
          className="w-full"
        >
          Start Voice Call
        </Button>
      )}

      {callState === 'calling' && (
        <div className="flex flex-col items-center gap-2">
          <p className="text-sm text-gray-600">Calling...</p>
          <Button
            onClick={endCall}
            variant="destructive"
            className="w-full"
          >
            Cancel Call
          </Button>
        </div>
      )}

      {callState === 'receiving' && (
        <div className="flex flex-col items-center gap-2">
          <p className="text-sm text-gray-600">Incoming call...</p>
          <div className="flex gap-2 w-full">
            <Button
              onClick={acceptCall}
              className="flex-1"
            >
              Accept
            </Button>
            <Button
              onClick={rejectCall}
              variant="destructive"
              className="flex-1"
            >
              Reject
            </Button>
          </div>
        </div>
      )}

      {callState === 'connected' && (
        <div className="flex flex-col items-center gap-2">
          <p className="text-sm text-gray-600">Connected</p>
          <div className="flex gap-2 w-full">
            <Button
              onClick={toggleMute}
              variant={isMuted ? "outline" : "default"}
              className="flex-1"
            >
              {isMuted ? "Unmute" : "Mute"}
            </Button>
            <Button
              onClick={endCall}
              variant="destructive"
              className="flex-1"
            >
              End Call
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
