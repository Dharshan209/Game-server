import { useState } from 'react';
import { supabase } from '../utils/supabaseClient';
import { useNavigate } from 'react-router-dom';

function Login() {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    console.log("Name entered:", name);

    let { data: profiles, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('username', name)
      .eq('password', password)
      .single();

    if (error || !profiles) {
      console.log("Invalid username or password");
    } else {
      console.log("Successful login");
      localStorage.setItem("user",JSON.stringify(profiles));
      navigate('/Home');
    }
  };

  const handleSignup = () => {
    navigate('/signup');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded-2xl shadow-md w-full max-w-md">
        <h1 className="text-2xl font-bold mb-6 text-center text-gray-800">Welcome to Game</h1>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-gray-700 font-medium mb-1">Username:</label>
            <input
              placeholder='Name'
              type='text'
              value={name}
              required
              onChange={e => setName(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          <div>
            <label className="block text-gray-700 font-medium mb-1">Password:</label>
            <input
              type='password'
              value={password}
              required
              onChange={e => setPassword(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          <button
            type="submit"
            className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition"
          >
            Submit
          </button>
        </form>

        <div className="mt-4 text-center">
          <button
            onClick={handleSignup}
            className="text-blue-600 hover:underline"
          >
            Create an account
          </button>
        </div>
      </div>
    </div>
  );
}

export default Login;
