export interface User {
  id: string;
  name: string;
  email: string;
  avatar: string;
}

export interface Project {
  id: string;
  title: string;
  description: string;
  members: User[];
  lastUpdated: string;
}

export interface ManuscriptVersion {
  id: string;
  timestamp: string;
  label: string;
  content: ManuscriptContent;
}

export interface ManuscriptContent {
  abstract: string;
  introduction: string;
  methodology: string;
  results: string;
}

export interface Dataset {
  id: string;
  title: string;
  description: string;
  fileName: string;
  fileSize: string;
  date: string;
}

export interface Experiment {
  id: string;
  title: string;
  description: string;
  notes: string;
  attachments: string[];
  timestamp: string;
}

export interface Collaborator {
  id: string;
  email: string;
  name: string;
  role: 'Owner' | 'Editor' | 'Viewer';
  avatar: string;
}

export const mockUsers: User[] = [
  { id: '1', name: 'Dr. Sarah Chen', email: 'sarah@lab.edu', avatar: 'SC' },
  { id: '2', name: 'Prof. James Miller', email: 'james@uni.edu', avatar: 'JM' },
  { id: '3', name: 'Dr. Aisha Patel', email: 'aisha@research.org', avatar: 'AP' },
  { id: '4', name: 'Marco Rossi', email: 'marco@lab.edu', avatar: 'MR' },
];

export const mockProjects: Project[] = [
  {
    id: '1',
    title: 'Neural Network Optimization for Climate Modeling',
    description: 'Exploring novel deep learning architectures to improve climate prediction accuracy in tropical regions.',
    members: [mockUsers[0], mockUsers[1], mockUsers[2]],
    lastUpdated: '2 hours ago',
  },
  {
    id: '2',
    title: 'CRISPR Gene Therapy — Phase II Trials',
    description: 'Documenting results from phase II clinical trials for targeted gene therapy in rare genetic disorders.',
    members: [mockUsers[0], mockUsers[3]],
    lastUpdated: '1 day ago',
  },
  {
    id: '3',
    title: 'Quantum Computing & Cryptography Review',
    description: 'A comprehensive literature review on post-quantum cryptographic algorithms and their feasibility.',
    members: [mockUsers[1], mockUsers[2], mockUsers[3]],
    lastUpdated: '3 days ago',
  },
  {
    id: '4',
    title: 'Sustainable Urban Agriculture Study',
    description: 'Field study analyzing vertical farming efficiency in metropolitan environments across Southeast Asia.',
    members: [mockUsers[0], mockUsers[1]],
    lastUpdated: '1 week ago',
  },
];

export const defaultManuscript: ManuscriptContent = {
  abstract: 'This study presents a novel approach to neural network optimization specifically designed for climate modeling applications. Our methodology combines transformer architectures with physics-informed constraints to achieve superior prediction accuracy.',
  introduction: 'Climate modeling remains one of the most computationally demanding challenges in modern science. Traditional general circulation models (GCMs) require enormous computational resources while still producing predictions with significant uncertainty margins. Recent advances in deep learning offer promising alternatives.',
  methodology: 'We employed a modified transformer architecture with attention mechanisms tuned to capture temporal and spatial dependencies in climate data. The model was trained on ERA5 reanalysis data spanning 1979–2023, with physics-informed loss functions ensuring thermodynamic consistency.',
  results: 'Our model achieved a 23% reduction in root mean square error compared to baseline CNN approaches. The attention maps revealed meaningful physical patterns, suggesting the model learned genuine climate dynamics rather than spurious correlations.',
};

export const mockVersions: ManuscriptVersion[] = [
  { id: 'v3', timestamp: 'Mar 28, 2026 — 14:32', label: 'Added results section', content: defaultManuscript },
  { id: 'v2', timestamp: 'Mar 25, 2026 — 09:15', label: 'Revised methodology', content: { ...defaultManuscript, results: '' } },
  { id: 'v1', timestamp: 'Mar 20, 2026 — 16:45', label: 'Initial draft', content: { ...defaultManuscript, methodology: '', results: '' } },
];

export const mockDatasets: Dataset[] = [
  { id: '1', title: 'ERA5 Temperature Anomalies', description: 'Global temperature anomaly data from 1979-2023', fileName: 'era5_temp_anomalies.nc', fileSize: '2.4 GB', date: 'Mar 15, 2026' },
  { id: '2', title: 'Tropical Cyclone Tracks', description: 'IBTrACS cyclone tracking dataset for the Pacific basin', fileName: 'ibtracs_pacific.csv', fileSize: '148 MB', date: 'Mar 10, 2026' },
];

export const mockExperiments: Experiment[] = [
  { id: '1', title: 'Baseline CNN Training Run', description: 'Training baseline convolutional model on ERA5 data', notes: 'Used ResNet-50 backbone with 3 output heads. Training converged after 45 epochs. RMSE: 1.82°C.', attachments: ['training_log_v1.txt', 'loss_curve.png'], timestamp: 'Mar 12, 2026 — 10:30' },
  { id: '2', title: 'Transformer Architecture v1', description: 'First iteration of transformer-based climate model', notes: 'Implemented custom attention mechanism for spatial-temporal data. Initial results promising — 15% improvement over baseline.', attachments: ['model_config.yaml', 'attention_maps.png', 'results_v1.csv'], timestamp: 'Mar 18, 2026 — 15:45' },
  { id: '3', title: 'Physics-Informed Loss Function', description: 'Added thermodynamic constraints to loss function', notes: 'Incorporated energy conservation and moisture balance constraints. Final RMSE: 1.40°C — 23% improvement over baseline.', attachments: ['physics_loss.py', 'comparison_chart.png'], timestamp: 'Mar 26, 2026 — 09:20' },
];
