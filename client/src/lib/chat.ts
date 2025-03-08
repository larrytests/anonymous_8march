import { auth } from "./firebase";
import { io, Socket } from "socket.io-client";

interface ChatMessage {
  type: 'message' | 'connection_status' | 'user_connected' | 'typing' | 'voice_call';
  content?: string;
  senderId?: string;
  receiverId?: string;
  timestamp?: string;
  connectionStatus?: 'connected' | 'connecting' | 'disconnected';
  isTyping?: boolean;
  callData?: {
    type: 'request' | 'accepted' | 'rejected' | 'ended';
    offer?: RTCSessionDescriptionInit;
    answer?: RTCSessionDescriptionInit;
  };
}

export class ChatService {
  private socket: Socket | null = null;
  private messageCallbacks: Set<(message: ChatMessage) => void> = new Set();
  private connectionState: 'connecting' | 'connected' | 'disconnected' = 'disconnected';
  private messageSet = new Set<string>();
  private typingTimeoutId: NodeJS.Timeout | null = null;
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteAudio: HTMLAudioElement | null = null;
  private currentCallPeer: string | null = null;

  constructor() {
    this.initializeConnection();
    this.remoteAudio = new Audio();
    this.remoteAudio.autoplay = true;
  }

  private generateMessageId(message: ChatMessage): string {
    return `${message.type}-${message.senderId}-${message.receiverId}-${message.timestamp}`;
  }

  private notifyConnectionStatus() {
    const statusMessage: ChatMessage = {
      type: 'connection_status',
      connectionStatus: this.connectionState,
      timestamp: new Date().toISOString()
    };
    this.messageCallbacks.forEach(callback => callback(statusMessage));
  }

  private async initializeConnection(): Promise<void> {
    if (!auth.currentUser) {
      console.log("No authenticated user");
      return;
    }

    if (this.socket?.connected) {
      console.log("Already connected");
      return;
    }

    this.connectionState = 'connecting';
    this.notifyConnectionStatus();

    try {
      if (this.socket) {
        this.socket.close();
        this.socket = null;
      }

      this.socket = io(window.location.origin, {
        transports: ['websocket'],
        auth: {
          token: await auth.currentUser.getIdToken(),
          userId: auth.currentUser.uid
        },
        reconnection: true,
        reconnectionDelay: 1000,
        timeout: 10000
      });

      this.configureSocketHandlers();

    } catch (error) {
      console.error("Error in initializeConnection:", error);
      this.connectionState = 'disconnected';
      this.notifyConnectionStatus();
      throw error;
    }
  }

  private configureSocketHandlers() {
    if (!this.socket) return;

    this.socket.on("connect", () => {
      console.log("Socket.IO connected");
      this.connectionState = 'connected';
      this.notifyConnectionStatus();
      this.messageSet.clear();

      if (auth.currentUser) {
        this.socket?.emit("user_connected", {
          type: 'user_connected',
          senderId: auth.currentUser.uid,
          timestamp: new Date().toISOString()
        });
      }
    });

    this.socket.on("disconnect", () => {
      console.log("Socket.IO disconnected");
      this.connectionState = 'disconnected';
      this.notifyConnectionStatus();
      this.cleanupCall();
    });

    this.socket.on("connect_error", (error) => {
      console.error("Socket.IO connection error:", error);
      this.connectionState = 'disconnected';
      this.notifyConnectionStatus();
    });

    this.socket.on("message", this.handleIncomingMessage.bind(this));
    this.socket.on("typing", this.handleTypingIndicator.bind(this));
    this.configureCallHandlers();
  }

  private handleIncomingMessage(message: ChatMessage) {
    if (message.senderId === auth.currentUser?.uid && message.type !== 'typing') {
      return;
    }

    const messageId = this.generateMessageId(message);
    if (!this.messageSet.has(messageId)) {
      this.messageSet.add(messageId);
      this.messageCallbacks.forEach(callback => callback(message));
    }
  }

  private handleTypingIndicator(message: ChatMessage) {
    if (message.receiverId === auth.currentUser?.uid) {
      this.messageCallbacks.forEach(callback => callback(message));
    }
  }

  private async configureCallHandlers() {
    if (!this.socket) return;

    // Handle incoming call request
    this.socket.on("incoming_call", async (data: { from: string }) => {
      console.log("Received incoming call from:", data.from);
      this.messageCallbacks.forEach(callback => callback({
        type: 'voice_call',
        senderId: data.from,
        callData: { type: 'request' }
      }));
    });

    // Handle call acceptance
    this.socket.on("call_accepted", async (data: { from: string }) => {
      console.log("Call accepted by:", data.from);
      try {
        await this.setupPeerConnection();
        const offer = await this.peerConnection?.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: false
        });

        if (!offer || !this.peerConnection) {
          throw new Error("Failed to create offer");
        }

        await this.peerConnection.setLocalDescription(offer);
        console.log("Local description set:", offer);

        this.socket?.emit("offer", {
          to: data.from,
          offer
        });
      } catch (error) {
        console.error("Error in call acceptance flow:", error);
        this.cleanupCall();
      }
    });

    // Handle WebRTC offer
    this.socket.on("offer", async (data: { from: string; offer: RTCSessionDescriptionInit }) => {
      console.log("Received offer from:", data.from);
      try {
        await this.setupPeerConnection();
        if (!this.peerConnection) {
          throw new Error("PeerConnection not initialized");
        }

        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
        console.log("Remote description set");

        const answer = await this.peerConnection.createAnswer();
        await this.peerConnection.setLocalDescription(answer);
        console.log("Local description (answer) set");

        this.socket?.emit("answer", {
          to: data.from,
          answer
        });
      } catch (error) {
        console.error("Error handling offer:", error);
        this.cleanupCall();
      }
    });

    // Handle WebRTC answer
    this.socket.on("answer", async (data: { from: string; answer: RTCSessionDescriptionInit }) => {
      console.log("Received answer from:", data.from);
      try {
        if (!this.peerConnection) {
          throw new Error("PeerConnection not initialized");
        }
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
        console.log("Remote description (answer) set");
      } catch (error) {
        console.error("Error handling answer:", error);
        this.cleanupCall();
      }
    });

    // Handle ICE candidates
    this.socket.on("ice_candidate", async (data: { from: string; candidate: RTCIceCandidateInit }) => {
      console.log("Received ICE candidate:", data.candidate);
      try {
        if (this.peerConnection && data.candidate) {
          await this.peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
          console.log("ICE candidate added successfully");
        }
      } catch (error) {
        console.error("Error handling ICE candidate:", error);
      }
    });

    // Handle call end
    this.socket.on("end_call", () => {
      console.log("Call ended by remote peer");
      this.cleanupCall();
      this.messageCallbacks.forEach(callback => callback({
        type: 'voice_call',
        callData: { type: 'ended' }
      }));
    });
  }

  private async setupPeerConnection() {
    if (this.peerConnection) {
      console.log("PeerConnection already exists");
      return;
    }

    const configuration: RTCConfiguration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' }
      ]
    };

    this.peerConnection = new RTCPeerConnection(configuration);
    console.log("PeerConnection created");

    // Handle ICE candidate events
    this.peerConnection.onicecandidate = (event) => {
      console.log("ICE candidate event:", event.candidate);
      if (event.candidate && this.currentCallPeer) {
        this.socket?.emit("ice_candidate", {
          to: this.currentCallPeer,
          candidate: event.candidate
        });
      }
    };

    // Handle ICE connection state changes
    this.peerConnection.oniceconnectionstatechange = () => {
      console.log("ICE connection state:", this.peerConnection?.iceConnectionState);
    };

    // Handle track events
    this.peerConnection.ontrack = (event) => {
      console.log("Received remote track:", event.streams[0]);
      const [remoteStream] = event.streams;
      if (this.remoteAudio) {
        this.remoteAudio.srcObject = remoteStream;
        this.remoteAudio.play().catch(console.error);
      }
    };

    try {
      console.log("Requesting media access...");
      this.localStream = await navigator.mediaDevices.getUserMedia({ 
        audio: true,
        video: false
      });
      console.log("Media access granted:", this.localStream.getTracks());

      this.localStream.getTracks().forEach(track => {
        if (this.localStream && this.peerConnection) {
          this.peerConnection.addTrack(track, this.localStream);
          console.log("Added local track:", track.kind);
        }
      });
    } catch (error) {
      console.error("Error accessing microphone:", error);
      throw error;
    }
  }

  async initiateCall(receiverId: string) {
    console.log("Initiating call to:", receiverId);
    try {
      this.currentCallPeer = receiverId;
      this.socket?.emit("call_request", { to: receiverId });
    } catch (error) {
      console.error("Error initiating call:", error);
      this.cleanupCall();
      throw error;
    }
  }

  async acceptCall(callerId: string) {
    console.log("Accepting call from:", callerId);
    try {
      this.currentCallPeer = callerId;
      await this.setupPeerConnection();
      this.socket?.emit("accept_call", { from: callerId });
    } catch (error) {
      console.error("Error accepting call:", error);
      this.cleanupCall();
      throw error;
    }
  }

  rejectCall(callerId: string) {
    console.log("Rejecting call from:", callerId);
    this.socket?.emit("reject_call", { to: callerId });
    this.cleanupCall();
  }

  private cleanupCall() {
    console.log("Cleaning up call...");
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        track.stop();
        console.log("Stopped local track:", track.kind);
      });
      this.localStream = null;
    }

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
      console.log("PeerConnection closed");
    }

    if (this.remoteAudio) {
      this.remoteAudio.srcObject = null;
      console.log("Remote audio cleared");
    }

    this.currentCallPeer = null;
  }

  endCall() {
    console.log("Ending call");
    if (this.currentCallPeer) {
      this.socket?.emit("end_call", { to: this.currentCallPeer });
    }
    this.cleanupCall();
  }

  onMessage(callback: (message: ChatMessage) => void) {
    this.messageCallbacks.add(callback);
    return () => {
      this.messageCallbacks.delete(callback);
    };
  }

  sendMessage(message: ChatMessage) {
    if (!this.socket?.connected) {
      console.warn('Socket not connected, attempting to reconnect...');
      this.initializeConnection();
      return;
    }

    try {
      const messageId = this.generateMessageId(message);
      if (!this.messageSet.has(messageId) || message.type === 'typing') {
        if (message.type !== 'typing') {
          this.messageSet.add(messageId);
        }
        this.socket.emit(message.type, message);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      if (this.connectionState !== 'connected') {
        this.initializeConnection();
      }
    }
  }

  sendTypingIndicator(receiverId: string, isTyping: boolean) {
    if (this.typingTimeoutId) {
      clearTimeout(this.typingTimeoutId);
      this.typingTimeoutId = null;
    }

    this.sendMessage({
      type: 'typing',
      senderId: auth.currentUser?.uid,
      receiverId,
      isTyping,
      timestamp: new Date().toISOString()
    });

    if (isTyping) {
      this.typingTimeoutId = setTimeout(() => {
        this.sendTypingIndicator(receiverId, false);
      }, 3000);
    }
  }

  close() {
    this.endCall();
    if (this.typingTimeoutId) {
      clearTimeout(this.typingTimeoutId);
      this.typingTimeoutId = null;
    }
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.messageCallbacks.clear();
    this.messageSet.clear();
    this.connectionState = 'disconnected';
    this.notifyConnectionStatus();
  }
}