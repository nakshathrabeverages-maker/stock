import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Input, Alert } from '@/components';
import { authService } from '@/services/authService';
import { useAuthStore } from '@/store/authStore';

export const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [forgotPassword, setForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetMessage, setResetMessage] = useState('');
  const navigate = useNavigate();
  const { setUser, setLoading: setAuthLoading } = useAuthStore();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const user = await authService.login(email, password);
      setUser(user);
      setAuthLoading(false);
      navigate('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    setError('');
    setResetMessage('');
    setLoading(true);

    try {
      await authService.sendPasswordReset(resetEmail || email);
      setResetMessage('Password reset email sent. Please check your inbox.');
      setForgotPassword(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send reset email');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary to-secondary flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo Section */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Nakshatra</h1>
          <p className="text-white text-opacity-80">Stock & Production Management</p>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-lg shadow-xl p-8">
          <h2 className="text-2xl font-bold text-gray-800 mb-6 text-center">Login</h2>

          {error && (
            <Alert
              type="error"
              message={error}
              onClose={() => setError('')}
            />
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <Input
              label="Email"
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            <Input
              label="Password"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            <div className="flex justify-between items-center">
              <button
                type="button"
                className="text-sm text-primary hover:underline"
                onClick={() => setForgotPassword((prev) => !prev)}
              >
                {forgotPassword ? 'Back to login' : 'Forgot password?'}
              </button>
            </div>

            {forgotPassword ? (
              <div className="space-y-4">
                <Input
                  label="Reset Email"
                  type="email"
                  placeholder="Enter your email for reset link"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  required
                />
                <Button
                  type="button"
                  variant="primary"
                  fullWidth
                  loading={loading}
                  onClick={handlePasswordReset}
                >
                  Send Password Reset
                </Button>
              </div>
            ) : (
              <Button
                type="submit"
                variant="primary"
                fullWidth
                loading={loading}
              >
                Login
              </Button>
            )}
          </form>
          {resetMessage && (
            <div className="mt-4 p-3 text-sm text-green-700 bg-green-50 rounded-lg">
              {resetMessage}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
