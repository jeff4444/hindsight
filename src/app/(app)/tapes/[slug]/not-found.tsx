import { Button, EmptyState } from '@/components/ui';

export default function TapeNotFound() {
  return (
    <div className="mx-auto max-w-lg py-16">
      <EmptyState
        icon="tape"
        title="No such tape"
        body="This tape either never existed or is not open yet. The open ones are all unmetered."
        action={
          <Button as="a" href="/tapes" variant="primary" size="lg">
            Browse tapes
          </Button>
        }
      />
    </div>
  );
}
