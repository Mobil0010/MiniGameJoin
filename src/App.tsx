import { Navigate, Route, Routes } from 'react-router'
import HomePage from './pages/HomePage'
import YachtDicePage from './pages/YachtDicePage'
import YachtModePage from './pages/YachtModePage'
import YachtOnlinePage from './pages/YachtOnlinePage'
import './App.css'

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/yacht-dice" element={<YachtModePage />} />
      <Route path="/yacht-dice/local" element={<YachtDicePage />} />
      <Route path="/yacht-dice/online" element={<YachtOnlinePage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
