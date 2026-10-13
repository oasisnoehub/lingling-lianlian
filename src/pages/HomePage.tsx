import { useNavigate } from 'react-router-dom'
import { Person } from '../types'

interface HomePageProps {
  persons?: Person[]
}

function HomePage({ persons = defaultPersons }: HomePageProps) {
  const navigate = useNavigate()

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>Ling Ling Lian Lian</h1>
      </header>

      <main className="main-content">
        <div className="person-grid">
          {persons.map((person) => (
            <div
              key={person.id}
              className="person-card"
              onClick={() => navigate(`/timeline/${person.id}`)}
            >
              <div
                className="person-avatar"
                style={{ background: person.avatar_color }}
              >
                {person.name.charAt(0)}
              </div>
              <div className="person-name">{person.name}</div>
              <div className="person-card-subtitle">点击进入时间线</div>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}

const defaultPersons: Person[] = [
  { id: 'person-a', name: 'Ling Ling', avatar_color: '#4f8ef7', created_at: Date.now() },
  { id: 'person-b', name: 'Lian Lian', avatar_color: '#a855f7', created_at: Date.now() },
]

export default HomePage
