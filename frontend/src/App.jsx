import { createBrowserRouter, RouterProvider } from "react-router-dom";

import HomePage from "./pages/HomePage";
import VerifyPage from "./pages/VerifyPage";
import SignupPage from "./pages/SignupPage";
import Studentdashboard from "./pages/Studentdashboard";
import Universitydashboard from "./pages/Universitydashboard";

const router = createBrowserRouter([
  {
    path: "/",
    element: <HomePage />,
  },
  
  {
    path: "/verify",
    element: <VerifyPage />,
  },
  {
    path: "/signup",
    element: <SignupPage />,
  },

  {
    path: "/studentdashboard",
    element: <Studentdashboard />,
  },

  {
    path: "/universitydashboard",
    element: <Universitydashboard />,
  },


]);

function App() {
  return <RouterProvider router={router} />;
}

export default App;
