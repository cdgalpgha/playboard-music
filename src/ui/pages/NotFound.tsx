import { Link } from "react-router";
import { PageHeader } from "../controls.tsx";

export default function NotFound() {
  return (
    <div>
      <PageHeader eyebrow="Not found" title="That page isn't here">
        <Link to="/" className="text-green underline">
          Back to the start
        </Link>
      </PageHeader>
    </div>
  );
}
