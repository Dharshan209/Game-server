import { useParams } from 'react-router-dom';

function Room() {
  const { roomId } = useParams();

  return (
    <div className="text-center mt-20">
      <h1 className="text-3xl font-bold">Room ID: {roomId}</h1>
      <p>Waiting for players to join...</p>
    </div>
  );
}

export default Room;
