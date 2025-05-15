import { useState } from 'react';
import './App.css';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Login from './Components/login';
import Signup from './Components/signup';
import Home from './Components/Home';
import Room from './Components/room';
function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/Home" element={<Home/>}/>
        <Route path="/Room/:roomId" element={<Room/>}/>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
