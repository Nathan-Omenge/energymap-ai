import { Navigate, Route, Routes, BrowserRouter } from "react-router-dom";
import Layout from "./layout/Layout.jsx";
import PriorityMapPage from "./pages/PriorityMapPage.jsx";
import DemandForecastPage from "./pages/DemandForecastPage.jsx";
import ScenarioSimulatorPage from "./pages/ScenarioSimulatorPage.jsx";

const App = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<PriorityMapPage />} />
          <Route path="demand" element={<DemandForecastPage />} />
          <Route path="scenarios" element={<ScenarioSimulatorPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
};

export default App;
