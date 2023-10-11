# frozen_string_literal: true

class AddUsers < ActiveRecord::Migration[7.1]
  def up
    create_table :users do |t|
      t.string :username, null: false, index: { unique: true }
      t.string :password_digest, null: false

      t.timestamps
    end
  end

  def down
    drop_table :users
  end
end
