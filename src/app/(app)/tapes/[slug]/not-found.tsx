import { routes } from '@/lib/routes';
import { Button, EmptyState } from '@/components/ui';

export default function TapeNotFound() {
  return (
    <div className="mx-auto max-w-lg py-16">
      <EmptyState
        icon="tape"
        title="No such tape"
        body="This tape does not exist, or its maker has not made it public."
        action={
          <Button href={routes.tapes.index()} variant="primary" size="lg">
            Browse tapes
          </Button>
        }
      />
    </div>
  );
}
