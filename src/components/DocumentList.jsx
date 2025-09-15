import { downloadUrl } from "../api";

export default function DocumentList({ items = [] }) {
  if (!items.length) return <p>No approved documents found.</p>;
  return (
    <ul className="doc-list" style={{paddingLeft:0, listStyle:'none'}}>
      {items.map(d => (
        <li key={d.id} className="doc-row" style={{display:'flex', justifyContent:'space-between', borderBottom:'1px solid #eee', padding:'10px 0'}}>
          <div>
            <strong>{d.name}</strong>
            <div className="sub" style={{fontSize:12, color:'#555'}}>#{d.id} · {d.status} · v{d.major}.{d.minor}</div>
          </div>
          <a href={downloadUrl({ id: d.id, number: d.number, major: d.major, minor: d.minor })}>Download</a>
        </li>
      ))}
    </ul>
  );
}
