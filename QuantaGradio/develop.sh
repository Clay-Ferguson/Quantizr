#!/bin/bash

# Opens VSCode, ensuring it comes up with the already correct Conda Environment

source ./conda_init.sh

conda_path="/home/clay/miniconda3"
export PATH="$conda_path/bin:$PATH"
source $conda_path/bin/activate quanta_gradio

if [[ "$CONDA_DEFAULT_ENV" == "quanta_gradio" ]]; then
  code .
else
  echo "Failed to set Conda Environment: Expected quanta_gradio but found $CONDA_DEFAULT_ENV"
  sleep 10s
  exit 1
fi

