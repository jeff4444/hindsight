import { routes } from '@/lib/routes';
import { Button, EmptyState } from '@/components/ui';

export default function ProfileNotFound() {
  return (
    <div className="mx-auto max-w-lg py-16">
      <EmptyState
        icon="signature"
        title="No trader with that handle"
        body="Handles can be changed, so a link that used to work may point at a name nobody holds now."
        action={
          <Button href={routes.play.index} variant="primary" size="lg">
            Back to Play
          </Button>
        }
      />
    </div>
  );
}
