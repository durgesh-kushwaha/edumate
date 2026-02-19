import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const [email, setEmail] = useState('admin@eduvision.com');
  const [password, setPassword] = useState('Pass@1234');
  const [error, setError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await client.post('/auth/login', { email, password });
      login(response.data.access_token);
      navigate('/dashboard');
    } catch {
      setError('Login failed');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center">
      <form onSubmit={onSubmit} className="bg-white shadow-md p-8 rounded w-96 space-y-4">
        <h1 className="text-xl font-semibold">Login</h1>
        <input className="w-full border p-2" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="w-full border p-2" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p className="text-red-600">{error}</p>}
        <button className="w-full bg-slate-900 text-white p-2 rounded">Sign In</button>
      </form>
    </div>
  );
}
