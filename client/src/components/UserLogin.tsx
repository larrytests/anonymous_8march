import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';

interface UserLoginProps {
  onLogin: (username: string) => void;
}

export default function UserLogin({ onLogin }: UserLoginProps) {
  const [username, setUsername] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      toast({
        title: "Username Required",
        description: "Please enter a username to continue.",
        variant: "destructive"
      });
      return;
    }

    if (!/^[a-zA-Z0-9]{3,20}$/.test(username)) {
      toast({
        title: "Invalid Username",
        description: "Username must be 3-20 characters long and contain only letters and numbers.",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    try {
      onLogin(username);
    } catch (error) {
      toast({
        title: "Login Failed",
        description: error instanceof Error ? error.message : "Failed to set username. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4">
      <div className="w-full max-w-md bg-white rounded-lg shadow-md p-6">
        <h2 className="text-2xl font-bold text-center mb-6">Welcome to Anonymous Support</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
              Choose a Username
            </label>
            <Input
              id="username"
              type="text"
              placeholder="Enter username (3-20 characters)"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={isLoading}
              className="w-full"
            />
          </div>
          <Button
            type="submit"
            disabled={isLoading}
            className="w-full"
          >
            {isLoading ? "Joining..." : "Join Chat"}
          </Button>
        </form>
      </div>
    </div>
  );
}
