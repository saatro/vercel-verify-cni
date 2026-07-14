export default function AdminLayout({ map, panel }) {
  return (
    <div className="admin-page">
      <div className="admin-dashboard">
        <div className="admin-map-wrapper">
          {map}
        </div>

        <div className="admin-panel">
          {panel}
        </div>
      </div>
    </div>
  );
}
