import { useState, useEffect } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'

function App() {
  const [count, setCount] = useState(0)

  // We also have an api that will get us the current count and allow us to increment and decrement it
  // Track it as a separate state variable
  const [apiCount, setApiCount] = useState(0)

  // Call to the /api/get on load to get the apiCount
  useEffect(() => {
    fetch('/api/get')
      .then((res) => res.json())
      .then((data) => setApiCount(data))
  }, [])

  const apiIncrement = () => {
    fetch('/api/increment', {
      method: 'POST',
      })
      .then((res) => res.json())
      .then((data) => setApiCount(data))
  }

  const apiDecrement = () => {
    fetch('/api/decrement', {
      method: 'POST',
      })
      .then((res) => res.json())
      .then((data) => setApiCount(data))
  }

  return (
    <div className="App">
      <h1>Hello World - Serverless</h1>
      <div className="card">
        <button onClick={() => setCount((count) => count + 1)}>
          app count is {count}
        </button>
        <hr />
        <p>API Count Is {apiCount}</p>
        <button onClick={apiIncrement}>Increment</button>
        <button onClick={apiDecrement}>Decrement</button>
      </div>
    </div>
  )
}

export default App
