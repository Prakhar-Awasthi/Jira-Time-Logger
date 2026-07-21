import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { JiraUser } from "../utils/jira";

type Theme = "light" | "dark";

interface JiraContextValue {
  jiraUrl: string;
  setJiraUrl: (v: string) => void;
  email: string;
  setEmail: (v: string) => void;
  token: string;
  setToken: (v: string) => void;
  loading: boolean;
  setLoading: (v: boolean) => void;
  result: string;
  setResult: (v: string) => void;
  theme: Theme;
  setTheme: (v: Theme) => void;
  selectedUser: string;
  setSelectedUser: (v: string) => void;
  selectedTeam: string;
  setSelectedTeam: (v: string) => void;
  allUsers: JiraUser[];
  setAllUsers: (v: JiraUser[]) => void;
  allTeams: string[];
  setAllTeams: (v: string[]) => void;
  saveCredentials: () => void;
  credentialsReady: boolean;
}

const JiraContext = createContext<JiraContextValue | null>(null);

export function useJira(): JiraContextValue {
  const ctx = useContext(JiraContext);
  if (!ctx) throw new Error("useJira must be used within JiraProvider");
  return ctx;
}

export function JiraProvider({ children }: { children: ReactNode }) {
  const [jiraUrl, setJiraUrl] = useState("");
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");
  const [theme, setTheme] = useState<Theme>("light");
  const [selectedUser, setSelectedUser] = useState("all");
  const [selectedTeam, setSelectedTeam] = useState("all");
  const [allUsers, setAllUsers] = useState<JiraUser[]>([]);
  const [allTeams, setAllTeams] = useState<string[]>([]);

  useEffect(() => {
    chrome.storage.local.get(["jiraUrl", "email", "token"], (data) => {
      if (data.jiraUrl) setJiraUrl(data.jiraUrl);
      if (data.email) setEmail(data.email);
      if (data.token) setToken(data.token);
    });
  }, []);

  useEffect(() => {
    document.body.setAttribute("data-theme", theme);
  }, [theme]);

  const saveCredentials = () => {
    chrome.storage.local.set({ jiraUrl, email, token });
    setResult("Credentials saved");
  };

  const credentialsReady = !!(jiraUrl && email && token);

  return (
    <JiraContext.Provider value={{
      jiraUrl, setJiraUrl,
      email, setEmail,
      token, setToken,
      loading, setLoading,
      result, setResult,
      theme, setTheme,
      selectedUser, setSelectedUser,
      selectedTeam, setSelectedTeam,
      allUsers, setAllUsers,
      allTeams, setAllTeams,
      saveCredentials,
      credentialsReady,
    }}>
      {children}
    </JiraContext.Provider>
  );
}
