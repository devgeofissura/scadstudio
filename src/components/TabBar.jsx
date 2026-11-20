import { Box, Network } from 'lucide-react';

const TABS = [
  { id: 'scad', label: 'SCAD 3D', hint: 'OpenSCAD · STL', icon: Box },
  { id: 'wireviz', label: 'WireViz', hint: 'YAML · PDF/SVG/PNG', icon: Network },
];

export default function TabBar({ activeTab, onChange }) {
  return (
    <nav className="tab-bar" aria-label="Ferramentas">
      {TABS.map(({ id, label, hint, icon: Icon }) => (
        <button
          key={id}
          type="button"
          className={`tab-button ${activeTab === id ? 'active' : ''}`}
          aria-current={activeTab === id ? 'page' : undefined}
          onClick={() => onChange(id)}
        >
          <Icon size={15} />
          <span>{label}</span>
          <small>{hint}</small>
        </button>
      ))}
      <span className="tab-bar-note">Processamento local · nada é enviado</span>
    </nav>
  );
}
