import { Routes, Route } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import NotebookWorkspace from './pages/NotebookWorkspace'

function App() {
  return (
    <Routes>
      <Route path='/' element={<Dashboard />} />
      <Route path='/notebook/:id' element={<NotebookWorkspace />} />
    </Routes>
  )
}

export default App
