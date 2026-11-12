import { Page } from "../../shell/components/Layout";
import UniversalSearch from "../../shell/components/UniversalSearch";
export default function Explore() {
  return (
    <Page className="universal-search-page">
      <h1>Explorar o teu universo</h1>
      <UniversalSearch inline />
    </Page>
  );
}
