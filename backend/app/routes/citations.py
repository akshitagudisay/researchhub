from __future__ import annotations

import json
import re
from typing import List, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models
from ..auth import get_current_user, decode_access_token
from ..schemas import CitationRead

router = APIRouter()

# ── Scoring ───────────────────────────────────────────────────────────────────
SCORE_CITATION_ADD = 4


# ── Expanded curated suggestion database ─────────────────────────────────────
# Each entry has: keywords, title, authors, journal, year, doi,
#   formatted_apa, formatted_ieee, domain, reason

SUGGESTIONS = [
    # ── NLP / Transformers ────────────────────────────────────────────────────
    {
        "keywords": ["transformer", "attention mechanism", "self-attention", "multi-head attention", "encoder decoder"],
        "title": "Attention Is All You Need",
        "authors": ["Vaswani, A.", "Shazeer, N.", "Parmar, N.", "Uszkoreit, J.", "Jones, L.", "Gomez, A.", "Kaiser, L.", "Polosukhin, I."],
        "journal": "NeurIPS", "year": 2017,
        "doi": "10.48550/arXiv.1706.03762",
        "formatted_apa": "Vaswani, A., Shazeer, N., Parmar, N., Uszkoreit, J., Jones, L., Gomez, A., Kaiser, L., & Polosukhin, I. (2017). Attention Is All You Need. NeurIPS.",
        "formatted_ieee": 'A. Vaswani et al., "Attention Is All You Need," NeurIPS, 2017.',
        "domain": "NLP / Transformers",
        "reason": "Introduced the Transformer architecture — foundational for all modern language models.",
    },
    {
        "keywords": ["bert", "bidirectional transformer", "pre-training", "language representation", "masked language model"],
        "title": "BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding",
        "authors": ["Devlin, J.", "Chang, M.-W.", "Lee, K.", "Toutanova, K."],
        "journal": "NAACL", "year": 2019,
        "doi": "10.48550/arXiv.1810.04805",
        "formatted_apa": "Devlin, J., Chang, M.-W., Lee, K., & Toutanova, K. (2019). BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding. NAACL.",
        "formatted_ieee": 'J. Devlin, M.-W. Chang, K. Lee, K. Toutanova, "BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding," NAACL, 2019.',
        "domain": "NLP / Transformers",
        "reason": "Established BERT pre-training — the foundation for modern NLP fine-tuning workflows.",
    },
    {
        "keywords": ["gpt", "language model", "autoregressive", "text generation", "few-shot", "prompt"],
        "title": "Language Models are Few-Shot Learners (GPT-3)",
        "authors": ["Brown, T.", "Mann, B.", "Ryder, N.", "Subbiah, M.", "Amodei, D."],
        "journal": "NeurIPS", "year": 2020,
        "doi": "10.48550/arXiv.2005.14165",
        "formatted_apa": "Brown, T., Mann, B., Ryder, N., Subbiah, M., & Amodei, D. (2020). Language Models are Few-Shot Learners. NeurIPS.",
        "formatted_ieee": 'T. Brown et al., "Language Models are Few-Shot Learners," NeurIPS, 2020.',
        "domain": "NLP / Transformers",
        "reason": "Demonstrates few-shot learning in large language models — critical for modern NLP.",
    },
    {
        "keywords": ["natural language processing", "nlp", "text classification", "sentiment analysis", "named entity"],
        "title": "A Survey of Deep Learning for Natural Language Processing",
        "authors": ["Young, T.", "Hazarika, D.", "Poria, S.", "Cambria, E."],
        "journal": "IEEE Computational Intelligence Magazine", "year": 2018,
        "doi": "10.1109/MCI.2018.2840738",
        "formatted_apa": "Young, T., Hazarika, D., Poria, S., & Cambria, E. (2018). A Survey of Deep Learning for Natural Language Processing. IEEE Computational Intelligence Magazine.",
        "formatted_ieee": 'T. Young, D. Hazarika, S. Poria, E. Cambria, "A Survey of Deep Learning for Natural Language Processing," IEEE Comput. Intell. Mag., 2018.',
        "domain": "NLP",
        "reason": "Comprehensive review of deep learning methods for NLP tasks.",
    },
    # ── Computer Vision ───────────────────────────────────────────────────────
    {
        "keywords": ["convolutional neural network", "cnn", "image classification", "deep learning", "resnet", "image recognition"],
        "title": "Deep Residual Learning for Image Recognition",
        "authors": ["He, K.", "Zhang, X.", "Ren, S.", "Sun, J."],
        "journal": "CVPR", "year": 2016,
        "doi": "10.1109/CVPR.2016.90",
        "formatted_apa": "He, K., Zhang, X., Ren, S., & Sun, J. (2016). Deep Residual Learning for Image Recognition. CVPR.",
        "formatted_ieee": 'K. He, X. Zhang, S. Ren, J. Sun, "Deep Residual Learning for Image Recognition," CVPR, 2016.',
        "domain": "Computer Vision",
        "reason": "ResNet introduced skip connections solving the vanishing gradient problem in deep networks.",
    },
    {
        "keywords": ["object detection", "yolo", "faster rcnn", "bounding box", "region proposal", "detection network"],
        "title": "Faster R-CNN: Towards Real-Time Object Detection with Region Proposal Networks",
        "authors": ["Ren, S.", "He, K.", "Girshick, R.", "Sun, J."],
        "journal": "NeurIPS", "year": 2015,
        "doi": "10.48550/arXiv.1506.01497",
        "formatted_apa": "Ren, S., He, K., Girshick, R., & Sun, J. (2015). Faster R-CNN: Towards Real-Time Object Detection with Region Proposal Networks. NeurIPS.",
        "formatted_ieee": 'S. Ren, K. He, R. Girshick, J. Sun, "Faster R-CNN," NeurIPS, 2015.',
        "domain": "Computer Vision",
        "reason": "Standard baseline for real-time object detection pipelines.",
    },
    {
        "keywords": ["vision transformer", "vit", "image patch", "patch embedding", "visual attention"],
        "title": "An Image is Worth 16x16 Words: Transformers for Image Recognition at Scale",
        "authors": ["Dosovitskiy, A.", "Beyer, L.", "Kolesnikov, A.", "Weissenborn, D."],
        "journal": "ICLR", "year": 2021,
        "doi": "10.48550/arXiv.2010.11929",
        "formatted_apa": "Dosovitskiy, A., Beyer, L., Kolesnikov, A., & Weissenborn, D. (2021). An Image is Worth 16x16 Words. ICLR.",
        "formatted_ieee": 'A. Dosovitskiy et al., "An Image is Worth 16x16 Words," ICLR, 2021.',
        "domain": "Computer Vision",
        "reason": "Applied Transformers directly to image patches, challenging CNN dominance in vision.",
    },
    # ── Generative Models ─────────────────────────────────────────────────────
    {
        "keywords": ["generative adversarial", "gan", "image generation", "synthetic data", "discriminator", "generator"],
        "title": "Generative Adversarial Networks",
        "authors": ["Goodfellow, I.", "Pouget-Abadie, J.", "Mirza, M.", "Xu, B.", "Warde-Farley, D."],
        "journal": "NeurIPS", "year": 2014,
        "doi": "10.48550/arXiv.1406.2661",
        "formatted_apa": "Goodfellow, I., Pouget-Abadie, J., Mirza, M., Xu, B., & Warde-Farley, D. (2014). Generative Adversarial Networks. NeurIPS.",
        "formatted_ieee": 'I. Goodfellow et al., "Generative Adversarial Networks," NeurIPS, 2014.',
        "domain": "Generative Models",
        "reason": "Introduced adversarial training for generative models — foundational for image synthesis.",
    },
    {
        "keywords": ["diffusion model", "score matching", "denoising diffusion", "stable diffusion", "ddpm"],
        "title": "Denoising Diffusion Probabilistic Models",
        "authors": ["Ho, J.", "Jain, A.", "Abbeel, P."],
        "journal": "NeurIPS", "year": 2020,
        "doi": "10.48550/arXiv.2006.11239",
        "formatted_apa": "Ho, J., Jain, A., & Abbeel, P. (2020). Denoising Diffusion Probabilistic Models. NeurIPS.",
        "formatted_ieee": 'J. Ho, A. Jain, P. Abbeel, "Denoising Diffusion Probabilistic Models," NeurIPS, 2020.',
        "domain": "Generative Models",
        "reason": "Foundation of modern diffusion-based image generation (Stable Diffusion, DALL-E 2).",
    },
    {
        "keywords": ["variational autoencoder", "vae", "latent space", "generative model", "variational inference"],
        "title": "Auto-Encoding Variational Bayes",
        "authors": ["Kingma, D.", "Welling, M."],
        "journal": "ICLR", "year": 2014,
        "doi": "10.48550/arXiv.1312.6114",
        "formatted_apa": "Kingma, D., & Welling, M. (2014). Auto-Encoding Variational Bayes. ICLR.",
        "formatted_ieee": 'D. Kingma, M. Welling, "Auto-Encoding Variational Bayes," ICLR, 2014.',
        "domain": "Generative Models",
        "reason": "Introduced VAEs enabling structured latent space learning for generation tasks.",
    },
    # ── Reinforcement Learning ────────────────────────────────────────────────
    {
        "keywords": ["reinforcement learning", "q-learning", "policy gradient", "reward", "agent", "markov decision", "mdp"],
        "title": "Playing Atari with Deep Reinforcement Learning",
        "authors": ["Mnih, V.", "Kavukcuoglu, K.", "Silver, D.", "Graves, A."],
        "journal": "NeurIPS Workshop", "year": 2013,
        "doi": "10.48550/arXiv.1312.5602",
        "formatted_apa": "Mnih, V., Kavukcuoglu, K., Silver, D., & Graves, A. (2013). Playing Atari with Deep Reinforcement Learning. NeurIPS Workshop.",
        "formatted_ieee": 'V. Mnih et al., "Playing Atari with Deep Reinforcement Learning," NeurIPS Workshop, 2013.',
        "domain": "Reinforcement Learning",
        "reason": "First deep RL system mastering Atari games from raw pixels — seminal DRL work.",
    },
    {
        "keywords": ["proximal policy optimization", "ppo", "actor critic", "policy optimization", "trust region"],
        "title": "Proximal Policy Optimization Algorithms",
        "authors": ["Schulman, J.", "Wolski, F.", "Dhariwal, P.", "Radford, A.", "Klimov, O."],
        "journal": "arXiv", "year": 2017,
        "doi": "10.48550/arXiv.1707.06347",
        "formatted_apa": "Schulman, J., Wolski, F., Dhariwal, P., Radford, A., & Klimov, O. (2017). Proximal Policy Optimization Algorithms. arXiv.",
        "formatted_ieee": 'J. Schulman et al., "Proximal Policy Optimization Algorithms," arXiv, 2017.',
        "domain": "Reinforcement Learning",
        "reason": "PPO is the most widely used policy gradient algorithm for practical RL applications.",
    },
    # ── Graph Neural Networks ─────────────────────────────────────────────────
    {
        "keywords": ["graph neural network", "gnn", "graph attention", "node classification", "node embedding", "graph convolution"],
        "title": "Graph Attention Networks",
        "authors": ["Veličković, P.", "Cucurull, G.", "Casanova, A.", "Romero, A.", "Liò, P.", "Bengio, Y."],
        "journal": "ICLR", "year": 2018,
        "doi": "10.48550/arXiv.1710.10903",
        "formatted_apa": "Veličković, P., Cucurull, G., Casanova, A., Romero, A., Liò, P., & Bengio, Y. (2018). Graph Attention Networks. ICLR.",
        "formatted_ieee": 'P. Veličković et al., "Graph Attention Networks," ICLR, 2018.',
        "domain": "Graph Neural Networks",
        "reason": "Introduced attention-based aggregation for graph-structured data.",
    },
    {
        "keywords": ["graphsage", "graph sampling", "inductive learning", "graph", "neighbor aggregation"],
        "title": "Inductive Representation Learning on Large Graphs",
        "authors": ["Hamilton, W.", "Ying, R.", "Leskovec, J."],
        "journal": "NeurIPS", "year": 2017,
        "doi": "10.48550/arXiv.1706.02216",
        "formatted_apa": "Hamilton, W., Ying, R., & Leskovec, J. (2017). Inductive Representation Learning on Large Graphs. NeurIPS.",
        "formatted_ieee": 'W. Hamilton, R. Ying, J. Leskovec, "Inductive Representation Learning on Large Graphs," NeurIPS, 2017.',
        "domain": "Graph Neural Networks",
        "reason": "GraphSAGE enables scalable inductive learning on previously unseen graph nodes.",
    },
    # ── Federated / Distributed Learning ─────────────────────────────────────
    {
        "keywords": ["federated learning", "distributed training", "privacy", "communication efficient", "local update", "data heterogeneity"],
        "title": "Communication-Efficient Learning of Deep Networks from Decentralized Data",
        "authors": ["McMahan, B.", "Moore, E.", "Ramage, D.", "Hampson, S.", "y Arcas, B. A."],
        "journal": "AISTATS", "year": 2017,
        "doi": "10.48550/arXiv.1602.05629",
        "formatted_apa": "McMahan, B., Moore, E., Ramage, D., Hampson, S., & y Arcas, B. A. (2017). Communication-Efficient Learning of Deep Networks from Decentralized Data. AISTATS.",
        "formatted_ieee": 'B. McMahan et al., "Communication-Efficient Learning from Decentralized Data," AISTATS, 2017.',
        "domain": "Federated Learning",
        "reason": "Introduced FedAvg — the standard algorithm for federated learning.",
    },
    {
        "keywords": ["differential privacy", "privacy preserving", "noise mechanism", "private learning", "data privacy"],
        "title": "Deep Learning with Differential Privacy",
        "authors": ["Abadi, M.", "Chu, A.", "Goodfellow, I.", "McMahan, H. B.", "Mironov, I."],
        "journal": "ACM CCS", "year": 2016,
        "doi": "10.1145/2976749.2978318",
        "formatted_apa": "Abadi, M., Chu, A., Goodfellow, I., McMahan, H. B., & Mironov, I. (2016). Deep Learning with Differential Privacy. ACM CCS.",
        "formatted_ieee": 'M. Abadi et al., "Deep Learning with Differential Privacy," ACM CCS, 2016.',
        "domain": "Privacy / Federated Learning",
        "reason": "Established differentially private SGD for privacy-preserving machine learning.",
    },
    # ── Transfer Learning ─────────────────────────────────────────────────────
    {
        "keywords": ["transfer learning", "fine-tuning", "pretrained", "domain adaptation", "feature reuse"],
        "title": "How transferable are features in deep neural networks?",
        "authors": ["Yosinski, J.", "Clune, J.", "Bengio, Y.", "Lipson, H."],
        "journal": "NeurIPS", "year": 2014,
        "doi": "10.48550/arXiv.1411.1792",
        "formatted_apa": "Yosinski, J., Clune, J., Bengio, Y., & Lipson, H. (2014). How transferable are features in deep neural networks? NeurIPS.",
        "formatted_ieee": 'J. Yosinski, J. Clune, Y. Bengio, H. Lipson, "How transferable are features in deep neural networks?" NeurIPS, 2014.',
        "domain": "Transfer Learning",
        "reason": "Foundational analysis of feature transferability across deep network layers.",
    },
    # ── Protein Folding / Structural Biology ─────────────────────────────────
    {
        "keywords": ["protein folding", "alphafold", "protein structure", "amino acid", "structural prediction", "protein conformation"],
        "title": "Highly accurate protein structure prediction with AlphaFold",
        "authors": ["Jumper, J.", "Evans, R.", "Pritzel, A.", "Green, T.", "Figurnov, M."],
        "journal": "Nature", "year": 2021,
        "doi": "10.1038/s41586-021-03819-2",
        "formatted_apa": "Jumper, J., Evans, R., Pritzel, A., Green, T., & Figurnov, M. (2021). Highly accurate protein structure prediction with AlphaFold. Nature.",
        "formatted_ieee": 'J. Jumper et al., "Highly accurate protein structure prediction with AlphaFold," Nature, 2021.',
        "domain": "Structural Biology",
        "reason": "AlphaFold2 solved the decades-old protein structure prediction problem.",
    },
    {
        "keywords": ["protein folding", "protein language model", "esm", "sequence embeddings", "residue", "evolutionary scale"],
        "title": "Biological structure and function emerge from scaling unsupervised learning to 250 million protein sequences",
        "authors": ["Rives, A.", "Meier, J.", "Sercu, T.", "Goyal, S.", "Lin, Z."],
        "journal": "PNAS", "year": 2021,
        "doi": "10.1073/pnas.2016239118",
        "formatted_apa": "Rives, A., Meier, J., Sercu, T., Goyal, S., & Lin, Z. (2021). Biological structure and function emerge from scaling unsupervised learning to 250 million protein sequences. PNAS.",
        "formatted_ieee": 'A. Rives et al., "Biological structure from scaling unsupervised learning," PNAS, 2021.',
        "domain": "Structural Biology",
        "reason": "ESM protein language models learn structural features directly from sequence data.",
    },
    {
        "keywords": ["molecular dynamics", "force field", "molecular simulation", "biomolecule", "protein dynamics", "md simulation"],
        "title": "CHARMM36m: an improved force field for folded and intrinsically disordered proteins",
        "authors": ["Huang, J.", "Rauscher, S.", "Nawrocki, G.", "Ran, T.", "Feig, M."],
        "journal": "Nature Methods", "year": 2017,
        "doi": "10.1038/nmeth.4067",
        "formatted_apa": "Huang, J., Rauscher, S., Nawrocki, G., Ran, T., & Feig, M. (2017). CHARMM36m. Nature Methods.",
        "formatted_ieee": 'J. Huang et al., "CHARMM36m," Nature Methods, 2017.',
        "domain": "Molecular Biology",
        "reason": "Standard force field used in molecular dynamics simulations of proteins.",
    },
    # ── Molecular Biology / Genomics ─────────────────────────────────────────
    {
        "keywords": ["crispr", "cas9", "gene editing", "genome editing", "guide rna", "dna cleavage"],
        "title": "A Programmable Dual-RNA–Guided DNA Endonuclease in Adaptive Bacterial Immunity",
        "authors": ["Jinek, M.", "Chylinski, K.", "Fonfara, I.", "Hauer, M.", "Doudna, J. A.", "Charpentier, E."],
        "journal": "Science", "year": 2012,
        "doi": "10.1126/science.1225829",
        "formatted_apa": "Jinek, M., Chylinski, K., Fonfara, I., Hauer, M., Doudna, J. A., & Charpentier, E. (2012). A Programmable Dual-RNA–Guided DNA Endonuclease in Adaptive Bacterial Immunity. Science.",
        "formatted_ieee": 'M. Jinek et al., "A Programmable Dual-RNA–Guided DNA Endonuclease," Science, 2012.',
        "domain": "Genomics / Gene Editing",
        "reason": "Introduced CRISPR-Cas9 as a programmable genome editing tool — Nobel Prize 2020.",
    },
    {
        "keywords": ["rna sequencing", "transcriptome", "gene expression", "rna-seq", "single cell", "sequencing"],
        "title": "Mapping and quantifying mammalian transcriptomes by RNA-Seq",
        "authors": ["Mortazavi, A.", "Williams, B. A.", "McCue, K.", "Schaeffer, L.", "Wold, B."],
        "journal": "Nature Methods", "year": 2008,
        "doi": "10.1038/nmeth.1226",
        "formatted_apa": "Mortazavi, A., Williams, B. A., McCue, K., Schaeffer, L., & Wold, B. (2008). Mapping and quantifying mammalian transcriptomes by RNA-Seq. Nature Methods.",
        "formatted_ieee": 'A. Mortazavi et al., "Mapping and quantifying mammalian transcriptomes by RNA-Seq," Nature Methods, 2008.',
        "domain": "Genomics",
        "reason": "Established RNA-Seq as the standard method for transcriptome profiling.",
    },
    {
        "keywords": ["genomics", "whole genome sequencing", "snp", "variant calling", "genome wide association", "gwas"],
        "title": "A global reference for human genetic variation",
        "authors": ["1000 Genomes Project Consortium"],
        "journal": "Nature", "year": 2015,
        "doi": "10.1038/nature15393",
        "formatted_apa": "1000 Genomes Project Consortium. (2015). A global reference for human genetic variation. Nature.",
        "formatted_ieee": '1000 Genomes Project Consortium, "A global reference for human genetic variation," Nature, 2015.',
        "domain": "Genomics",
        "reason": "The 1000 Genomes Project is the primary reference for human genetic variation studies.",
    },
    # ── Cancer Biology / Oncology ─────────────────────────────────────────────
    {
        "keywords": ["cancer", "tumor", "oncology", "carcinogenesis", "hallmarks", "metastasis", "malignant"],
        "title": "Hallmarks of Cancer: The Next Generation",
        "authors": ["Hanahan, D.", "Weinberg, R. A."],
        "journal": "Cell", "year": 2011,
        "doi": "10.1016/j.cell.2011.02.013",
        "formatted_apa": "Hanahan, D., & Weinberg, R. A. (2011). Hallmarks of Cancer: The Next Generation. Cell.",
        "formatted_ieee": 'D. Hanahan, R. A. Weinberg, "Hallmarks of Cancer: The Next Generation," Cell, 2011.',
        "domain": "Cancer Biology",
        "reason": "Defines the canonical hallmarks of cancer — essential reference for oncology research.",
    },
    {
        "keywords": ["immunotherapy", "checkpoint inhibitor", "pd-1", "ctla-4", "immune response", "tumor immunity"],
        "title": "Cancer Immunotherapy Using Checkpoint Blockade",
        "authors": ["Ribas, A.", "Wolchok, J. D."],
        "journal": "Science", "year": 2018,
        "doi": "10.1126/science.aar4060",
        "formatted_apa": "Ribas, A., & Wolchok, J. D. (2018). Cancer Immunotherapy Using Checkpoint Blockade. Science.",
        "formatted_ieee": 'A. Ribas, J. D. Wolchok, "Cancer Immunotherapy Using Checkpoint Blockade," Science, 2018.',
        "domain": "Cancer / Immunotherapy",
        "reason": "Reviews checkpoint blockade immunotherapy — now standard of care for multiple cancers.",
    },
    # ── Drug Discovery / Pharmacology ─────────────────────────────────────────
    {
        "keywords": ["drug discovery", "virtual screening", "molecular docking", "lead compound", "pharmacophore", "binding affinity"],
        "title": "Machine learning for molecular and materials science",
        "authors": ["Butler, K. T.", "Davies, D. W.", "Cartwright, H.", "Isayev, O.", "Walsh, A."],
        "journal": "Nature", "year": 2018,
        "doi": "10.1038/s41586-018-0337-2",
        "formatted_apa": "Butler, K. T., Davies, D. W., Cartwright, H., Isayev, O., & Walsh, A. (2018). Machine learning for molecular and materials science. Nature.",
        "formatted_ieee": 'K. T. Butler et al., "Machine learning for molecular and materials science," Nature, 2018.',
        "domain": "Drug Discovery",
        "reason": "Reviews ML applications in molecular and materials science, including drug design.",
    },
    {
        "keywords": ["drug target", "protein ligand", "active site", "inhibitor", "kinase", "receptor binding", "drug design"],
        "title": "A Deep Learning Approach to Antibiotic Discovery",
        "authors": ["Stokes, J. M.", "Yang, K.", "Swanson, K.", "Jin, W.", "Cubillos-Ruiz, A."],
        "journal": "Cell", "year": 2020,
        "doi": "10.1016/j.cell.2020.01.021",
        "formatted_apa": "Stokes, J. M., Yang, K., Swanson, K., Jin, W., & Cubillos-Ruiz, A. (2020). A Deep Learning Approach to Antibiotic Discovery. Cell.",
        "formatted_ieee": 'J. M. Stokes et al., "A Deep Learning Approach to Antibiotic Discovery," Cell, 2020.',
        "domain": "Drug Discovery",
        "reason": "Applied deep learning to discover novel antibiotic compounds — landmark AI drug discovery paper.",
    },
    # ── Neuroscience ──────────────────────────────────────────────────────────
    {
        "keywords": ["neuroscience", "neural circuit", "synaptic plasticity", "long-term potentiation", "ltp", "hippocampus", "neuron"],
        "title": "The Organization of Behavior: A Neuropsychological Theory",
        "authors": ["Hebb, D. O."],
        "journal": "Wiley", "year": 1949,
        "doi": "10.4324/9781410612403",
        "formatted_apa": "Hebb, D. O. (1949). The Organization of Behavior: A Neuropsychological Theory. Wiley.",
        "formatted_ieee": 'D. O. Hebb, "The Organization of Behavior," Wiley, 1949.',
        "domain": "Neuroscience",
        "reason": "Introduced Hebbian learning — foundational for understanding synaptic plasticity.",
    },
    {
        "keywords": ["brain imaging", "fmri", "functional mri", "bold signal", "neural activation", "neuroimaging"],
        "title": "Dynamic functional connectivity: Promise, issues, and interpretations",
        "authors": ["Hutchison, R. M.", "Womelsdorf, T.", "Allen, E. A.", "Bandettini, P. A.", "Calhoun, V. D."],
        "journal": "NeuroImage", "year": 2013,
        "doi": "10.1016/j.neuroimage.2013.05.079",
        "formatted_apa": "Hutchison, R. M., Womelsdorf, T., Allen, E. A., Bandettini, P. A., & Calhoun, V. D. (2013). Dynamic functional connectivity. NeuroImage.",
        "formatted_ieee": 'R. M. Hutchison et al., "Dynamic functional connectivity," NeuroImage, 2013.',
        "domain": "Neuroscience / Neuroimaging",
        "reason": "Key reference for dynamic fMRI functional connectivity analysis methodology.",
    },
    # ── Epidemiology / Public Health ──────────────────────────────────────────
    {
        "keywords": ["epidemiology", "clinical trial", "randomized controlled trial", "rct", "cohort study", "incidence", "prevalence"],
        "title": "CONSORT 2010 Statement: Updated Guidelines for Reporting Parallel Group Randomised Trials",
        "authors": ["Schulz, K. F.", "Altman, D. G.", "Moher, D."],
        "journal": "BMJ", "year": 2010,
        "doi": "10.1136/bmj.c332",
        "formatted_apa": "Schulz, K. F., Altman, D. G., & Moher, D. (2010). CONSORT 2010 Statement. BMJ.",
        "formatted_ieee": 'K. F. Schulz, D. G. Altman, D. Moher, "CONSORT 2010 Statement," BMJ, 2010.',
        "domain": "Epidemiology / Clinical Research",
        "reason": "Standard reporting guidelines for randomised clinical trials.",
    },
    {
        "keywords": ["pandemic", "infectious disease", "transmission", "basic reproduction number", "sir model", "epidemic", "contagion"],
        "title": "Contributions to the Mathematical Theory of Epidemics",
        "authors": ["Kermack, W. O.", "McKendrick, A. G."],
        "journal": "Proceedings of the Royal Society A", "year": 1927,
        "doi": "10.1098/rspa.1927.0118",
        "formatted_apa": "Kermack, W. O., & McKendrick, A. G. (1927). Contributions to the Mathematical Theory of Epidemics. Proceedings of the Royal Society A.",
        "formatted_ieee": 'W. O. Kermack, A. G. McKendrick, "Contributions to the Mathematical Theory of Epidemics," Proc. Royal Soc. A, 1927.',
        "domain": "Epidemiology",
        "reason": "Introduced the foundational SIR model for infectious disease transmission.",
    },
    # ── Climate / Environmental Science ──────────────────────────────────────
    {
        "keywords": ["climate change", "global warming", "carbon emissions", "greenhouse gas", "co2", "temperature", "climate model"],
        "title": "Global warming of 1.5°C: IPCC Special Report",
        "authors": ["Intergovernmental Panel on Climate Change (IPCC)"],
        "journal": "IPCC", "year": 2018,
        "doi": "10.1017/9781009157940",
        "formatted_apa": "IPCC. (2018). Global warming of 1.5°C. IPCC.",
        "formatted_ieee": 'IPCC, "Global warming of 1.5°C," IPCC, 2018.',
        "domain": "Climate Science",
        "reason": "Definitive IPCC report on 1.5°C global warming — essential climate change reference.",
    },
    {
        "keywords": ["machine learning climate", "earth system", "climate prediction", "weather forecasting", "atmospheric", "carbon cycle"],
        "title": "Tackling Climate Change with Machine Learning",
        "authors": ["Rolnick, D.", "Donti, P. L.", "Kaack, L. H.", "Kochanski, K.", "Lacoste, A."],
        "journal": "ACM Computing Surveys", "year": 2022,
        "doi": "10.1145/3485128",
        "formatted_apa": "Rolnick, D., Donti, P. L., Kaack, L. H., Kochanski, K., & Lacoste, A. (2022). Tackling Climate Change with Machine Learning. ACM Computing Surveys.",
        "formatted_ieee": 'D. Rolnick et al., "Tackling Climate Change with Machine Learning," ACM Comput. Surv., 2022.',
        "domain": "Climate Science / ML",
        "reason": "Comprehensive survey of ML applications for climate change mitigation.",
    },
    # ── Quantum Computing ─────────────────────────────────────────────────────
    {
        "keywords": ["quantum computing", "qubit", "quantum circuit", "quantum gate", "superposition", "entanglement", "quantum algorithm"],
        "title": "Quantum supremacy using a programmable superconducting processor",
        "authors": ["Arute, F.", "Arya, K.", "Babbush, R.", "Bacon, D.", "Bardin, J. C."],
        "journal": "Nature", "year": 2019,
        "doi": "10.1038/s41586-019-1666-5",
        "formatted_apa": "Arute, F., Arya, K., Babbush, R., Bacon, D., & Bardin, J. C. (2019). Quantum supremacy using a programmable superconducting processor. Nature.",
        "formatted_ieee": 'F. Arute et al., "Quantum supremacy using a programmable superconducting processor," Nature, 2019.',
        "domain": "Quantum Computing",
        "reason": "First experimental demonstration of quantum supremacy over classical computation.",
    },
    {
        "keywords": ["quantum machine learning", "quantum neural network", "variational quantum", "qml", "parameterized circuit"],
        "title": "Variational quantum algorithms",
        "authors": ["Cerezo, M.", "Arrasmith, A.", "Babbush, R.", "Benjamin, S. C.", "Endo, S."],
        "journal": "Nature Reviews Physics", "year": 2021,
        "doi": "10.1038/s42254-021-00348-9",
        "formatted_apa": "Cerezo, M., Arrasmith, A., Babbush, R., Benjamin, S. C., & Endo, S. (2021). Variational quantum algorithms. Nature Reviews Physics.",
        "formatted_ieee": 'M. Cerezo et al., "Variational quantum algorithms," Nat. Rev. Phys., 2021.',
        "domain": "Quantum Computing",
        "reason": "Review of variational quantum algorithms — core framework for near-term quantum computing.",
    },
    # ── Materials Science ─────────────────────────────────────────────────────
    {
        "keywords": ["materials science", "crystal structure", "density functional theory", "dft", "ab initio", "electronic structure"],
        "title": "Self-consistent equations including exchange and correlation effects",
        "authors": ["Kohn, W.", "Sham, L. J."],
        "journal": "Physical Review", "year": 1965,
        "doi": "10.1103/PhysRev.140.A1133",
        "formatted_apa": "Kohn, W., & Sham, L. J. (1965). Self-consistent equations including exchange and correlation effects. Physical Review.",
        "formatted_ieee": 'W. Kohn, L. J. Sham, "Self-consistent equations including exchange and correlation effects," Phys. Rev., 1965.',
        "domain": "Materials Science / Physics",
        "reason": "Kohn-Sham DFT — foundational method for electronic structure calculations in materials science.",
    },
    {
        "keywords": ["materials discovery", "high throughput screening", "machine learning materials", "property prediction", "crystal"],
        "title": "Crystal Graph Convolutional Neural Networks for an Accurate and Interpretable Prediction of Material Properties",
        "authors": ["Xie, T.", "Grossman, J. C."],
        "journal": "Physical Review Letters", "year": 2018,
        "doi": "10.1103/PhysRevLett.120.145301",
        "formatted_apa": "Xie, T., & Grossman, J. C. (2018). Crystal Graph Convolutional Neural Networks for Material Properties. Physical Review Letters.",
        "formatted_ieee": 'T. Xie, J. C. Grossman, "Crystal Graph Convolutional Neural Networks," Phys. Rev. Lett., 2018.',
        "domain": "Materials Science / ML",
        "reason": "Applied GNNs to predict material properties from crystal structures.",
    },
    # ── Economics / Social Science ────────────────────────────────────────────
    {
        "keywords": ["economics", "game theory", "nash equilibrium", "mechanism design", "auction", "microeconomics"],
        "title": "Non-Cooperative Games",
        "authors": ["Nash, J."],
        "journal": "Annals of Mathematics", "year": 1951,
        "doi": "10.2307/1969529",
        "formatted_apa": "Nash, J. (1951). Non-Cooperative Games. Annals of Mathematics.",
        "formatted_ieee": 'J. Nash, "Non-Cooperative Games," Ann. Math., 1951.',
        "domain": "Economics / Game Theory",
        "reason": "Introduced Nash equilibrium — foundational concept in game theory and economics.",
    },
    {
        "keywords": ["causal inference", "causal graph", "observational study", "counterfactual", "treatment effect", "confounding"],
        "title": "Causal Inference in Statistics: A Primer",
        "authors": ["Pearl, J.", "Glymour, M.", "Jewell, N. P."],
        "journal": "Wiley", "year": 2016,
        "doi": "10.1002/9781119348221",
        "formatted_apa": "Pearl, J., Glymour, M., & Jewell, N. P. (2016). Causal Inference in Statistics: A Primer. Wiley.",
        "formatted_ieee": 'J. Pearl, M. Glymour, N. P. Jewell, "Causal Inference in Statistics: A Primer," Wiley, 2016.',
        "domain": "Statistics / Causal Inference",
        "reason": "Standard reference for causal inference methodology using graphical models.",
    },
    # ── Optimization / ML Theory ──────────────────────────────────────────────
    {
        "keywords": ["stochastic gradient descent", "sgd", "adam optimizer", "optimization", "batch normalization", "learning rate"],
        "title": "Adam: A Method for Stochastic Optimization",
        "authors": ["Kingma, D. P.", "Ba, J."],
        "journal": "ICLR", "year": 2015,
        "doi": "10.48550/arXiv.1412.6980",
        "formatted_apa": "Kingma, D. P., & Ba, J. (2015). Adam: A Method for Stochastic Optimization. ICLR.",
        "formatted_ieee": 'D. P. Kingma, J. Ba, "Adam: A Method for Stochastic Optimization," ICLR, 2015.',
        "domain": "Machine Learning / Optimization",
        "reason": "Adam is the most widely used optimizer in deep learning research and practice.",
    },
    {
        "keywords": ["dropout", "regularization", "overfitting", "neural network regularization", "batch norm"],
        "title": "Dropout: A Simple Way to Prevent Neural Networks from Overfitting",
        "authors": ["Srivastava, N.", "Hinton, G.", "Krizhevsky, A.", "Sutskever, I.", "Salakhutdinov, R."],
        "journal": "JMLR", "year": 2014,
        "doi": "10.5555/2627435.2670313",
        "formatted_apa": "Srivastava, N., Hinton, G., Krizhevsky, A., Sutskever, I., & Salakhutdinov, R. (2014). Dropout. JMLR.",
        "formatted_ieee": 'N. Srivastava et al., "Dropout: A Simple Way to Prevent Neural Networks from Overfitting," JMLR, 2014.',
        "domain": "Machine Learning",
        "reason": "Dropout regularization is a universal technique to reduce overfitting in neural networks.",
    },
    # ── Multimodal / Contrastive Learning ─────────────────────────────────────
    {
        "keywords": ["contrastive learning", "self-supervised", "representation learning", "simclr", "moco", "clip"],
        "title": "A Simple Framework for Contrastive Learning of Visual Representations",
        "authors": ["Chen, T.", "Kornblith, S.", "Norouzi, M.", "Hinton, G."],
        "journal": "ICML", "year": 2020,
        "doi": "10.48550/arXiv.2002.05709",
        "formatted_apa": "Chen, T., Kornblith, S., Norouzi, M., & Hinton, G. (2020). A Simple Framework for Contrastive Learning. ICML.",
        "formatted_ieee": 'T. Chen, S. Kornblith, M. Norouzi, G. Hinton, "A Simple Framework for Contrastive Learning," ICML, 2020.',
        "domain": "Self-Supervised Learning",
        "reason": "SimCLR established contrastive self-supervised learning for visual representations.",
    },
    {
        "keywords": ["multimodal", "vision language", "image text", "clip", "zero-shot", "visual grounding"],
        "title": "Learning Transferable Visual Models From Natural Language Supervision",
        "authors": ["Radford, A.", "Kim, J. W.", "Hallacy, C.", "Ramesh, A.", "Goh, G."],
        "journal": "ICML", "year": 2021,
        "doi": "10.48550/arXiv.2103.00020",
        "formatted_apa": "Radford, A., Kim, J. W., Hallacy, C., Ramesh, A., & Goh, G. (2021). Learning Transferable Visual Models From Natural Language Supervision. ICML.",
        "formatted_ieee": 'A. Radford et al., "Learning Transferable Visual Models From Natural Language Supervision," ICML, 2021.',
        "domain": "Multimodal Learning",
        "reason": "CLIP achieved zero-shot visual recognition through image-text contrastive pretraining.",
    },
]


# ── APA / IEEE formatters ─────────────────────────────────────────────────────

def _format_apa(title: str, authors: list[str], journal: str | None, year: int | None) -> str:
    if not authors:
        auth_str = "Unknown"
    elif len(authors) == 1:
        auth_str = authors[0]
    elif len(authors) <= 7:
        auth_str = ", ".join(authors[:-1]) + ", & " + authors[-1]
    else:
        auth_str = ", ".join(authors[:6]) + ", ... & " + authors[-1]
    parts = [auth_str]
    if year:
        parts.append(f"({year}).")
    parts.append(f"{title}.")
    if journal:
        parts.append(f"{journal}.")
    return " ".join(parts)


def _format_ieee(title: str, authors: list[str], journal: str | None, year: int | None) -> str:
    if not authors:
        auth_str = "Unknown"
    elif len(authors) <= 3:
        auth_str = ", ".join(authors)
    else:
        auth_str = ", ".join(authors[:3]) + " et al."
    parts = [auth_str]
    parts.append(f'"{title},"')
    if journal:
        parts.append(f"{journal},")
    if year:
        parts.append(f"{year}.")
    return " ".join(parts)


# ── BibTeX parser ─────────────────────────────────────────────────────────────

def _parse_bibtex(bibtex_str: str) -> list[dict]:
    entries = []
    entry_re = re.compile(r'@(\w+)\s*\{([^,\s]+)\s*,([^@]*)\}', re.DOTALL | re.IGNORECASE)
    field_re = re.compile(r'(\w+)\s*=\s*(?:\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}|"([^"]*)")', re.DOTALL)

    for m in entry_re.finditer(bibtex_str):
        entry_type = m.group(1).lower()
        fields_str = m.group(3)
        fields: dict[str, str] = {}
        for fm in field_re.finditer(fields_str):
            key = fm.group(1).lower()
            val = (fm.group(2) or fm.group(3) or "").strip()
            fields[key] = val

        raw_authors = fields.get("author", "")
        if raw_authors:
            authors_list = [a.strip() for a in re.split(r'\s+and\s+', raw_authors, flags=re.IGNORECASE)]
        else:
            authors_list = []

        year_str = fields.get("year", "")
        year = int(year_str) if year_str.isdigit() else None

        title = fields.get("title", "Untitled").strip("{}")
        journal = (fields.get("journal") or fields.get("booktitle") or "").strip("{}")
        doi = fields.get("doi", "").strip("{}")

        entries.append({
            "type": entry_type,
            "title": title,
            "authors": authors_list,
            "journal": journal or None,
            "year": year,
            "doi": doi or None,
        })

    return entries


# ── Crossref DOI lookup ───────────────────────────────────────────────────────

async def _fetch_crossref(doi: str) -> dict:
    url = f"https://api.crossref.org/works/{doi}"
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(url, headers={"User-Agent": "ResearchHub/1.0 (mailto:admin@example.com)"})
    if resp.status_code != 200:
        raise HTTPException(status_code=404, detail=f"DOI not found: {doi}")
    data = resp.json().get("message", {})

    title_list = data.get("title", [])
    title = title_list[0] if title_list else "Unknown"

    raw_authors = data.get("author", [])
    authors = []
    for a in raw_authors:
        family = a.get("family", "")
        given = a.get("given", "")
        if family:
            authors.append(f"{family}, {given[0]}." if given else family)

    container = data.get("container-title", [])
    journal = container[0] if container else None

    date_parts = (
        data.get("published-print", {}).get("date-parts")
        or data.get("published-online", {}).get("date-parts")
        or data.get("published", {}).get("date-parts")
        or [[None]]
    )
    year = date_parts[0][0] if date_parts and date_parts[0] else None

    return {
        "title": title,
        "authors": authors,
        "journal": journal,
        "year": year,
        "doi": doi,
        "citation_type": data.get("type", "article"),
    }


# ── Access helpers ────────────────────────────────────────────────────────────

def _check_project_access(project_id: int, user: models.User, db: Session) -> bool:
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        return False
    if project.owner_id == user.id:
        return True
    return db.query(models.Collaborator).filter(
        models.Collaborator.project_id == project_id,
        models.Collaborator.user_id == user.id,
    ).first() is not None


def _check_write_access(project_id: int, user: models.User, db: Session) -> bool:
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        return False
    if project.owner_id == user.id:
        return True
    collab = db.query(models.Collaborator).filter(
        models.Collaborator.project_id == project_id,
        models.Collaborator.user_id == user.id,
    ).first()
    return collab is not None and collab.role in ("owner", "editor")


def _log_contribution(db: Session, user_id: int, project_id: int, action_type: str, score: int, meta: dict | None = None):
    db.add(models.Contribution(
        user_id=user_id,
        project_id=project_id,
        action_type=action_type,
        contribution_score=score,
        extra_data=json.dumps(meta or {}),
    ))
    db.commit()


def _db_to_read(c: models.Citation) -> CitationRead:
    try:
        authors = json.loads(c.authors)
    except Exception:
        authors = []
    return CitationRead(
        id=c.id,
        project_id=c.project_id,
        doi=c.doi,
        title=c.title,
        authors=authors,
        journal=c.journal,
        year=c.year,
        citation_type=c.citation_type,
        formatted_apa=c.formatted_apa,
        formatted_ieee=c.formatted_ieee,
        created_at=c.created_at,
    )


# ── Suggestion engine ─────────────────────────────────────────────────────────

def _run_suggestions(full_text: str, existing_titles: set[str]) -> list[dict]:
    full_text_lower = full_text.lower()
    scored: list[dict] = []
    seen_titles: set[str] = set()

    for suggestion in SUGGESTIONS:
        title_lower = suggestion["title"].lower()
        if title_lower in existing_titles:
            continue
        if title_lower in seen_titles:
            continue

        hits = sum(1 for kw in suggestion["keywords"] if kw in full_text_lower)
        if hits == 0:
            continue

        confidence = round(min(0.99, 0.60 + hits * 0.09), 2)
        seen_titles.add(title_lower)
        scored.append({
            **suggestion,
            "confidence": confidence,
            "_hits": hits,
        })

    # Sort by number of keyword hits (most relevant first)
    scored.sort(key=lambda x: x["_hits"], reverse=True)

    # Remove internal scoring key
    results = [{k: v for k, v in s.items() if k != "_hits"} for s in scored]

    # Pad to at least 5 results with popular fallbacks if needed
    if len(results) < 5:
        fallback_titles = {s["title"].lower() for s in results}
        fallbacks = []
        for s in SUGGESTIONS:
            tl = s["title"].lower()
            if tl not in existing_titles and tl not in fallback_titles and tl not in seen_titles:
                fallbacks.append({
                    **s,
                    "confidence": 0.45,
                    "reason": s.get("reason", "Highly cited paper in related research areas."),
                })
                fallback_titles.add(tl)
                if len(results) + len(fallbacks) >= 8:
                    break
        results.extend(fallbacks)

    return results[:10]


def _get_existing_titles(project_id: int, db: Session) -> set[str]:
    rows = db.query(models.Citation.title).filter(models.Citation.project_id == project_id).all()
    return {r[0].lower() for r in rows}


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/projects/{project_id}/citations", response_model=List[CitationRead])
def list_citations(
    project_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not _check_project_access(project_id, current_user, db):
        raise HTTPException(status_code=403, detail="No access")
    citations = (
        db.query(models.Citation)
        .filter(models.Citation.project_id == project_id)
        .order_by(models.Citation.created_at.desc())
        .all()
    )
    return [_db_to_read(c) for c in citations]


class DoiLookupRequest(BaseModel):
    doi: str


@router.post("/projects/{project_id}/citations/doi", response_model=CitationRead, status_code=201)
async def add_citation_by_doi(
    project_id: int,
    body: DoiLookupRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not _check_write_access(project_id, current_user, db):
        raise HTTPException(status_code=403, detail="Editor or owner access required")

    meta = await _fetch_crossref(body.doi.strip())

    apa = _format_apa(meta["title"], meta["authors"], meta["journal"], meta["year"])
    ieee = _format_ieee(meta["title"], meta["authors"], meta["journal"], meta["year"])

    citation = models.Citation(
        project_id=project_id,
        doi=meta["doi"],
        title=meta["title"],
        authors=json.dumps(meta["authors"]),
        journal=meta["journal"],
        year=meta["year"],
        citation_type=meta["citation_type"],
        formatted_apa=apa,
        formatted_ieee=ieee,
    )
    db.add(citation)
    db.commit()
    db.refresh(citation)
    _log_contribution(db, current_user.id, project_id, "citation_add", SCORE_CITATION_ADD, {"doi": body.doi})
    return _db_to_read(citation)


class BibtexImportRequest(BaseModel):
    bibtex: str


@router.post("/projects/{project_id}/citations/bibtex", response_model=List[CitationRead], status_code=201)
def import_bibtex(
    project_id: int,
    body: BibtexImportRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not _check_write_access(project_id, current_user, db):
        raise HTTPException(status_code=403, detail="Editor or owner access required")

    entries = _parse_bibtex(body.bibtex)
    if not entries:
        raise HTTPException(status_code=400, detail="No valid BibTeX entries found")

    created = []
    for entry in entries:
        apa = _format_apa(entry["title"], entry["authors"], entry["journal"], entry["year"])
        ieee = _format_ieee(entry["title"], entry["authors"], entry["journal"], entry["year"])
        citation = models.Citation(
            project_id=project_id,
            doi=entry.get("doi"),
            title=entry["title"],
            authors=json.dumps(entry["authors"]),
            journal=entry.get("journal"),
            year=entry.get("year"),
            citation_type=entry.get("type", "article"),
            formatted_apa=apa,
            formatted_ieee=ieee,
        )
        db.add(citation)
        db.commit()
        db.refresh(citation)
        _log_contribution(db, current_user.id, project_id, "citation_add", SCORE_CITATION_ADD, {"title": entry["title"]})
        created.append(_db_to_read(citation))

    return created


@router.delete("/projects/{project_id}/citations/{citation_id}", status_code=204)
def delete_citation(
    project_id: int,
    citation_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not _check_write_access(project_id, current_user, db):
        raise HTTPException(status_code=403, detail="Editor or owner access required")
    citation = db.query(models.Citation).filter(
        models.Citation.id == citation_id,
        models.Citation.project_id == project_id,
    ).first()
    if not citation:
        raise HTTPException(status_code=404, detail="Citation not found")
    db.delete(citation)
    db.commit()


@router.get("/projects/{project_id}/citations/suggestions")
def get_suggestions(
    project_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not _check_project_access(project_id, current_user, db):
        raise HTTPException(status_code=403, detail="No access")

    manuscript = db.query(models.Manuscript).filter(
        models.Manuscript.project_id == project_id
    ).first()

    full_text = ""
    if manuscript:
        try:
            content_dict = json.loads(manuscript.content)
            full_text = " ".join(v for v in content_dict.values() if v)
        except Exception:
            pass

    existing_titles = _get_existing_titles(project_id, db)
    suggestions = _run_suggestions(full_text, existing_titles)
    print(f"[Suggestions] project={project_id}, text_len={len(full_text)}, results={len(suggestions)}")
    return {"suggestions": suggestions}


class SuggestionsByTextRequest(BaseModel):
    text: str


@router.post("/projects/{project_id}/citations/suggestions")
def get_suggestions_by_text(
    project_id: int,
    body: SuggestionsByTextRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not _check_project_access(project_id, current_user, db):
        raise HTTPException(status_code=403, detail="No access")

    existing_titles = _get_existing_titles(project_id, db)
    suggestions = _run_suggestions(body.text, existing_titles)
    print(f"[Suggestions/text] project={project_id}, text_len={len(body.text)}, results={len(suggestions)}")
    return {"suggestions": suggestions}
