import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
// --- Type Definitions ---

interface PackageHash {
  algorithm: string;
  value: string;
}

interface MetadataDependency {
  package_id: string;
  package_name: string;
  version: string;
  package_hash: PackageHash;
}

interface PackageMetadata {
  schema_version: string;
  package_id: string;
  package_name: string;
  version: string;
  package_hash: PackageHash;
  dependencies?: MetadataDependency[];
}

interface PackageIdentity {
  package_id: string;
  package_version: string;
  package_hash: PackageHash;
}

interface VettingStateOutput {
  schema_version: string;
  app_name: string;
  network: 'mainnet' | 'devnet' | 'testnet';
  last_updated: string;
  vetting_state: {
    vet: PackageIdentity[];
    unvet: PackageIdentity[];
  };
}

interface PackageNode {
  identity: PackageIdentity;
  dependencies: string[]; // Internal array of package_ids
  isExplicitlyUnvetted: boolean; // Tracks if it was unvetted in the previous state
  vetStatus?: 'vet' | 'unvet';
}

// --- Main Vetting Logic ---

export function computeTargetVettingState(
  baseRepoPath: string,
  appName: string,
  network: 'mainnet' | 'devnet' | 'testnet'
): void {
  const appPath = path.join(baseRepoPath, 'apps', appName);
  const packagesPath = path.join(appPath, 'packages');
  const vettingStatesPath = path.join(appPath, 'vetting-states');
  const outputPath = path.join(vettingStatesPath, `${network}.json`);

  if (!fs.existsSync(packagesPath)) {
    throw new Error(`Packages directory not found: ${packagesPath}`);
  }

  // 1. Read previous state if it exists
  let previousState: VettingStateOutput | null = null;
  const previousStatusMap = new Map<string, 'vet' | 'unvet'>();
  const knownIdentities = new Map<string, PackageIdentity>();

  if (fs.existsSync(outputPath)) {
    console.log(`Found previous state at ${outputPath}. Loading...`);
    previousState = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
    
    // Catalog previous vet/unvet statuses
    for (const pkg of previousState!.vetting_state.vet) {
      previousStatusMap.set(pkg.package_id, 'vet');
      knownIdentities.set(pkg.package_id, pkg);
    }
    for (const pkg of previousState!.vetting_state.unvet) {
      previousStatusMap.set(pkg.package_id, 'unvet');
      knownIdentities.set(pkg.package_id, pkg);
    }
  }

  // 2. Read all packages from disk and build the dependency graph
  const packageGraph = new Map<string, PackageNode>();
  const packageDirs = fs.readdirSync(packagesPath);

  for (const dirName of packageDirs) {
    const dirPath = path.join(packagesPath, dirName);
    if (!fs.statSync(dirPath).isDirectory()) continue;

    const metadataFilePath = path.join(dirPath, 'metadata.json');
    if (!fs.existsSync(metadataFilePath)) continue;

    const metadata: PackageMetadata = JSON.parse(fs.readFileSync(metadataFilePath, 'utf-8'));
    
    const dependencies = metadata.dependencies 
      ? metadata.dependencies.map(dep => dep.package_id) 
      : [];

    packageGraph.set(metadata.package_id, {
      identity: {
        package_id: metadata.package_id,
        package_version: metadata.version,
        package_hash: metadata.package_hash
      },
      dependencies: dependencies,
      // If it was unvetted previously, we enforce that override
      isExplicitlyUnvetted: previousStatusMap.get(metadata.package_id) === 'unvet'
    });
  }

  // 3. Inject packages from the previous state that are missing from the local disk
  // (Prevents historical packages from disappearing from the network state just because 
  // the local directory was cleaned up).
  for (const [pkgId, status] of previousStatusMap.entries()) {
    if (!packageGraph.has(pkgId)) {
      packageGraph.set(pkgId, {
        identity: knownIdentities.get(pkgId)!,
        dependencies: [], // We don't have metadata for missing deps, evaluate standalone
        isExplicitlyUnvetted: status === 'unvet'
      });
    }
  }

  // 4. Single-pass recursive evaluation of vetting status based on dependencies
  function evaluateVettingStatus(pkgId: string, visited = new Set<string>()): 'vet' | 'unvet' {
    const node = packageGraph.get(pkgId);
    
    // If the package is missing entirely from both disk and previous state, it fails
    if (!node) return 'unvet'; 
    
    // Return memoized result if already computed
    if (node.vetStatus) return node.vetStatus; 
    
    // Detect circular dependencies
    if (visited.has(pkgId)) {
      node.vetStatus = 'unvet';
      return 'unvet';
    }
    
    visited.add(pkgId);

    // If it was explicitly marked unvet in the previous state, it remains unvet
    if (node.isExplicitlyUnvetted) {
      node.vetStatus = 'unvet';
      return 'unvet';
    }

    // Evaluate all dependencies
    for (const depId of node.dependencies) {
      const depStatus = evaluateVettingStatus(depId, visited);
      if (depStatus === 'unvet') {
        node.vetStatus = 'unvet'; // If any dependency fails/is unvetted, this cascades to unvet
        return 'unvet';
      }
    }

    // All checks passed
    node.vetStatus = 'vet';
    return 'vet';
  }

  // Evaluate all packages in the graph
  for (const pkgId of packageGraph.keys()) {
    evaluateVettingStatus(pkgId);
  }

  // 5. Construct Output Schema
  const finalState: VettingStateOutput = {
    schema_version: "1.0",
    app_name: appName,
    network: network,
    last_updated: new Date().toISOString(),
    vetting_state: {
      vet: [],
      unvet: []
    }
  };

  // Populate vet/unvet arrays
  for (const node of packageGraph.values()) {
    if (node.vetStatus === 'vet') {
      finalState.vetting_state.vet.push(node.identity);
    } else {
      finalState.vetting_state.unvet.push(node.identity);
    }
  }

  // 6. Write back to `<network>.json`
  if (!fs.existsSync(vettingStatesPath)) {
    fs.mkdirSync(vettingStatesPath, { recursive: true });
  }

  fs.writeFileSync(outputPath, JSON.stringify(finalState, null, 2), 'utf-8');
  console.log(`Successfully generated target vetting state at: ${outputPath}`);
}

// --- Execution ---
const isExecutedDirectly = process.argv[1] === fileURLToPath(import.meta.url);

if (isExecutedDirectly) {
  const args = process.argv.slice(2);
  if (args.length < 3) {
    console.error("Usage: tsx compute-vetting-state.ts <baseRepoPath> <appName> <network>");
    process.exit(1);
  }

  const [baseRepoPath, appName, network] = args;
  
  if (!['mainnet', 'devnet', 'testnet'].includes(network)) {
    console.error("Network must be one of: mainnet, devnet, testnet");
    process.exit(1);
  }

  try {
    computeTargetVettingState(baseRepoPath, appName, network as 'mainnet' | 'devnet' | 'testnet');
  } catch (error) {
    console.error("Failed to compute vetting state:", error);
  }
}