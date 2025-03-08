import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Card } from '@/components/ui/card';

interface UserRegistrationProps {
  onRegister: (username: string) => Promise<void>;
  isConnecting: boolean;
}

export function UserRegistration({ onRegister, isConnecting }: UserRegistrationProps) {
  const [username, setUsername] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!username.trim()) {
      toast({
        title: "Username Required",
        description: "Please enter a username to continue",
        variant: "destructive"
      });
      return;
    }

    try {
      setIsSubmitting(true);
      await onRegister(username.trim());
    } catch (error) {
      toast({
        title: "Registration Failed",
        description: error instanceof Error ? error.message : "Failed to register username",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <Card className="w-full max-w-md p-6 space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold tracking-tight">Welcome to Chat</h1>
          <p className="text-sm text-muted-foreground">
            Enter a username to start chatting
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Input
              type="text"
              placeholder="Enter username (3-20 characters)"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={isSubmitting || isConnecting}
              className="w-full"
              minLength={3}
              maxLength={20}
              pattern="[a-zA-Z0-9]{3,20}"
              required
            />
            <p className="text-xs text-muted-foreground">
              Use 3-20 alphanumeric characters
            </p>
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={isSubmitting || isConnecting}
          >
            {isConnecting ? 'Connecting...' : isSubmitting ? 'Registering...' : 'Join Chat'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
