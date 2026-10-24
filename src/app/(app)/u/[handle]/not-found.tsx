import { Button, EmptyState } from '@/components/ui';

export default function ProfileNotFound() {
  return (
    <div className="mx-auto max-w-lg py-16">
      <EmptyState
        icon="signature"
        title="No player with that handle"
        body="Handles can be changed, so a link that used to work may point at a name nobody holds now."
        action={
          <Button as="a" href="/today" variant="primary" size="lg">
            Back to today
          </Button>
        }
      />
    </div>
  );
}
