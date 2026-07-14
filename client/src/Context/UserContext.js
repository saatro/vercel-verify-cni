import { createContext, useState, useContext } from "react";

const UserContext = createContext();

export const UserProvider = ({ children }) => {
  const [currentOrder, setCurrentOrder] = useState(null);
  const [currentLivreur, setCurrentLivreur] = useState(null);

  return (
    <UserContext.Provider
      value={{ currentOrder, setCurrentOrder, currentLivreur, setCurrentLivreur }}
    >
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => useContext(UserContext);
