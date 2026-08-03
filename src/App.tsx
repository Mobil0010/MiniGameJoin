import { Navigate, Route, Routes } from 'react-router'
import RequiredAndroidUpdateGate from './components/RequiredAndroidUpdateGate'
import HomePage from './pages/HomePage'
import LocalGamesPage from './pages/LocalGamesPage'
import YachtDicePage from './pages/YachtDicePage'
import YachtOnlinePage from './pages/YachtOnlinePage'
import './App.css'

function App() {
  return (
    <RequiredAndroidUpdateGate>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/local" element={<LocalGamesPage />} />
        <Route path="/online" element={<YachtOnlinePage />} />
        <Route path="/yacht-dice" element={<Navigate to="/local" replace />} />
        <Route path="/yacht-dice/local" element={<YachtDicePage />} />
        <Route
          path="/yacht-dice/online"
          element={<Navigate to="/online" replace />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </RequiredAndroidUpdateGate>
  )
}

export default App
