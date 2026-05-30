import { db } from "../config/firebase";

export default function TestFirebase() {
  console.log(db);

  return (
    <div className="p-5">
      Firebase Connected Successfully
    </div>
  );
}