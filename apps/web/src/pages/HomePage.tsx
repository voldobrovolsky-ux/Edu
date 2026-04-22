import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export function HomePage() {
  const navigate = useNavigate();
  useEffect(() => {
    // Слой 0: сразу уводим в "главную" секцию.
    navigate("/section/main", { replace: true });
  }, [navigate]);
  return null;
}

