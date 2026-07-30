import { EmptyState } from '../components/ui';

/**
 * Tabs whose features are not built yet.
 *
 * These are honest empty states, not fake UI: each says plainly that
 * the section is coming and what will be there. Mock feeds and dummy
 * conversations would look better in a screenshot and be worse for
 * everyone actually testing the app.
 */

export function Home() {
  return (
    <div className="screen">
      <EmptyState
        title="The feed isn't live yet"
        body="Posts, stories and check-ins from people you follow will land here."
      />
    </div>
  );
}

export function Discover() {
  return (
    <div className="screen">
      <EmptyState
        title="Discovery isn't live yet"
        body="Grid, swipe and nearby browsing arrive with the location release."
      />
    </div>
  );
}

export function MapTab() {
  return (
    <div className="screen">
      <EmptyState
        title="The map isn't live yet"
        body="You'll see people nearby by approximate area — never an exact position."
      />
    </div>
  );
}

export function Messages() {
  return (
    <div className="screen">
      <EmptyState
        title="No conversations yet"
        body="Messaging opens once discovery ships, so there's someone to talk to."
      />
    </div>
  );
}

export function Alerts() {
  return (
    <div className="screen">
      <EmptyState
        title="Nothing new"
        body="Woofs, gifts, courts and friend requests will show up here."
      />
    </div>
  );
}
