import { NavLink, Outlet } from "react-router-dom";

const Layout = () => {
  const navItems = [
    { to: "/", label: "Priority Map" },
    { to: "/demand", label: "Demand Forecasting" },
    { to: "/scenarios", label: "Scenario Simulator" },
  ];

  return (
    <div className="layout-root">
      <header className="layout-header">
        <div className="brand">EnergyMap.AI</div>
        <nav>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `nav-link ${isActive ? "nav-link-active" : ""}`
              }
              end={item.to === "/"}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="layout-content">
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;
