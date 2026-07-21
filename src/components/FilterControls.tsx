import { Worklog, extractUsersFromWorklogs, extractTeamsFromWorklogs } from "../utils/jira";
import { useJira } from "../context/JiraContext";

interface FilterControlsProps {
  worklogs: Worklog[];
  loading: boolean;
  showUser?: boolean;
}

export function FilterControls({ worklogs, loading, showUser = true }: FilterControlsProps) {
  const { selectedUser, setSelectedUser, selectedTeam, setSelectedTeam, allUsers, allTeams } = useJira();

  const availableUsers = (() => {
    let filtered = worklogs;
    if (selectedTeam !== "all") {
      filtered = filtered.filter(wl => wl.team === selectedTeam);
    }
    return extractUsersFromWorklogs(filtered);
  })();

  const availableTeams = (() => {
    let filtered = worklogs;
    if (selectedUser !== "all") {
      filtered = filtered.filter(wl => wl.authorEmail === selectedUser);
    }
    return extractTeamsFromWorklogs(filtered);
  })();

  return (
    <>
      {showUser && (
        <div className="input-group">
          <label>User</label>
          <select
            value={selectedUser}
            onChange={(e) => setSelectedUser(e.target.value)}
            disabled={loading || allUsers.length === 0}
          >
            <option value="all">{loading ? "Loading users..." : "Everyone"}</option>
            {availableUsers.map((user) => (
              <option key={user.emailAddress} value={user.emailAddress}>
                {user.displayName}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="input-group">
        <label>Team</label>
        <select
          value={selectedTeam}
          onChange={(e) => setSelectedTeam(e.target.value)}
          disabled={loading || allTeams.length === 0}
        >
          <option value="all">{loading ? "Loading teams..." : "All Teams"}</option>
          {availableTeams.map((team) => (
            <option key={team} value={team}>
              {team}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}
